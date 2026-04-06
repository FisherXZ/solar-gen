# Heuristic Context Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Haiku-API `Compactor` and tool-stub `compaction.py` with a single zero-dependency `HeuristicCompactor` that uses pure string extraction — no API calls, no failure modes, direct port of claw-code-2.

**Architecture:** `HeuristicCompactor.maybe_compact(messages)` stays async (matches all callers) but runs synchronously. Old messages are replaced by one synthetic user message containing an XML `<summary>` block built from tool names, recent user requests, pending-work keywords, key file paths, and a per-message timeline. Repeat compactions merge into "Previously compacted context" / "Newly compacted context" sections.

**Tech Stack:** Python 3.13, stdlib only (`json`, `os.path`), pytest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `agent/src/runtime/compactor.py` | Full rewrite | `HeuristicCompactor` class + all private helpers |
| `agent/tests/test_runtime_compactor.py` | Full rewrite | Tests for all helpers and end-to-end `maybe_compact` |
| `agent/src/compaction.py` | Delete | Replaced entirely |
| `agent/tests/test_compaction.py` | Delete | Replaced entirely |
| `agent/src/agents/chat.py` | Modify | Remove `api_key=` kwarg from `HeuristicCompactor(...)` |
| `agent/src/agents/research.py` | Modify | Remove `api_key=` kwarg from `HeuristicCompactor(...)` |

---

### Task 1: Delete old files

**Files:**
- Delete: `agent/src/compaction.py`
- Delete: `agent/tests/test_compaction.py`

- [ ] **Step 1: Delete both files**

```bash
rm agent/src/compaction.py agent/tests/test_compaction.py
```

- [ ] **Step 2: Verify gone**

```bash
ls agent/src/compaction.py agent/tests/test_compaction.py 2>&1
```
Expected: `No such file or directory` for both.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "refactor: delete tool-stub compaction.py — replaced by heuristic compactor"
```

---

### Task 2: Write failing tests for helpers

**Files:**
- Modify: `agent/tests/test_runtime_compactor.py` (full rewrite)

- [ ] **Step 1: Replace test file with the following**

```python
"""Tests for HeuristicCompactor and its private helpers."""
from __future__ import annotations

import json
import pytest

from runtime.compactor import (
    HeuristicCompactor,
    _build_continuation_message,
    _detect_existing_summary,
    _estimate_tokens,
    _extract_file_candidates,
    _extract_first_text,
    _extract_highlights,
    _extract_timeline,
    _format_summary,
    _merge_summaries,
    _summarize_messages,
    _truncate,
    CONTINUATION_PREAMBLE,
    RECENT_MESSAGES_NOTE,
)


# ---------------------------------------------------------------------------
# _truncate
# ---------------------------------------------------------------------------

def test_truncate_short_string_unchanged():
    assert _truncate("hello", 10) == "hello"


def test_truncate_exact_length_unchanged():
    assert _truncate("hello", 5) == "hello"


def test_truncate_long_string_adds_ellipsis():
    result = _truncate("abcdef", 4)
    assert result == "abcd…"
    assert len(result) == 5  # 4 chars + ellipsis


# ---------------------------------------------------------------------------
# _estimate_tokens
# ---------------------------------------------------------------------------

def test_estimate_tokens_empty():
    assert _estimate_tokens([]) == 0


def test_estimate_tokens_rough_quarter():
    msg = {"role": "user", "content": "x" * 400}
    tokens = _estimate_tokens([msg])
    # json overhead is small; 400 chars content → ~100 tokens
    assert 90 <= tokens <= 130


# ---------------------------------------------------------------------------
# _extract_file_candidates
# ---------------------------------------------------------------------------

def test_extract_file_candidates_python_and_sql():
    text = "Updated agent/src/runtime/compactor.py and migrations/005_init.sql today."
    files = _extract_file_candidates(text)
    assert "agent/src/runtime/compactor.py" in files
    assert "migrations/005_init.sql" in files


def test_extract_file_candidates_ignores_txt():
    files = _extract_file_candidates("see notes/readme.txt for details")
    assert not any(".txt" in f for f in files)


def test_extract_file_candidates_deduplicates():
    text = "agent/src/foo.py agent/src/foo.py agent/src/bar.py"
    files = _extract_file_candidates(text)
    assert files.count("agent/src/foo.py") == 1


def test_extract_file_candidates_strips_punctuation():
    files = _extract_file_candidates("see (agent/src/foo.py) for details.")
    assert "agent/src/foo.py" in files


def test_extract_file_candidates_capped_at_eight():
    parts = [f"a/b/f{i}.py" for i in range(20)]
    files = _extract_file_candidates(" ".join(parts))
    assert len(files) <= 8


# ---------------------------------------------------------------------------
# _extract_first_text
# ---------------------------------------------------------------------------

def test_extract_first_text_string_content():
    msg = {"role": "user", "content": "hello world"}
    assert _extract_first_text(msg) == "hello world"


def test_extract_first_text_list_content():
    msg = {
        "role": "assistant",
        "content": [
            {"type": "tool_use", "name": "search", "id": "1", "input": {}},
            {"type": "text", "text": "found it"},
        ],
    }
    assert _extract_first_text(msg) == "found it"


def test_extract_first_text_empty_returns_none():
    assert _extract_first_text({"role": "user", "content": "  "}) is None
    assert _extract_first_text({"role": "user", "content": []}) is None


# ---------------------------------------------------------------------------
# _detect_existing_summary
# ---------------------------------------------------------------------------

def _make_continuation_msg(summary: str) -> dict:
    return _build_continuation_message(summary)


def test_detect_existing_summary_returns_none_for_regular_message():
    msg = {"role": "user", "content": "hello"}
    assert _detect_existing_summary(msg) is None


def test_detect_existing_summary_returns_none_for_assistant():
    msg = _make_continuation_msg("<summary>stuff</summary>")
    msg["role"] = "assistant"
    assert _detect_existing_summary(msg) is None


def test_detect_existing_summary_roundtrip():
    raw_summary = "<summary>\nConversation summary:\n- Scope: 4 messages.\n</summary>"
    msg = _make_continuation_msg(raw_summary)
    result = _detect_existing_summary(msg)
    assert result is not None
    assert "Scope: 4 messages." in result


# ---------------------------------------------------------------------------
# _summarize_messages
# ---------------------------------------------------------------------------

def _user(text: str) -> dict:
    return {"role": "user", "content": text}


def _assistant_text(text: str) -> dict:
    return {"role": "assistant", "content": [{"type": "text", "text": text}]}


def _assistant_tool_use(name: str) -> dict:
    return {
        "role": "assistant",
        "content": [{"type": "tool_use", "id": "1", "name": name, "input": {"q": "test"}}],
    }


def _tool_result(content: str) -> dict:
    return {
        "role": "user",
        "content": [{"type": "tool_result", "tool_use_id": "1", "content": content}],
    }


def test_summarize_messages_scope_line():
    messages = [_user("find EPCs for ERCOT"), _assistant_text("searching now")]
    summary = _summarize_messages(messages)
    assert "Scope: 2 earlier messages compacted" in summary
    assert "user=1" in summary
    assert "assistant=1" in summary


def test_summarize_messages_includes_tool_names():
    messages = [_assistant_tool_use("web_search"), _tool_result("some results")]
    summary = _summarize_messages(messages)
    assert "web_search" in summary


def test_summarize_messages_recent_user_requests():
    messages = [
        _user("first request"),
        _assistant_text("ok"),
        _user("second request"),
        _assistant_text("done"),
    ]
    summary = _summarize_messages(messages)
    assert "second request" in summary


def test_summarize_messages_pending_work_keywords():
    messages = [
        _user("research EPCs"),
        _assistant_text("Next: push accepted projects to CRM and follow up on remaining queue."),
    ]
    summary = _summarize_messages(messages)
    assert "Pending work" in summary


def test_summarize_messages_epc_keyword_triggers_pending():
    messages = [
        _assistant_text("Found epc contractor SunPower for this project."),
    ]
    summary = _summarize_messages(messages)
    assert "Pending work" in summary


def test_summarize_messages_key_files():
    messages = [_user("update agent/src/runtime/compactor.py and migrations/007.sql")]
    summary = _summarize_messages(messages)
    assert "agent/src/runtime/compactor.py" in summary
    assert "migrations/007.sql" in summary


def test_summarize_messages_timeline_present():
    messages = [_user("hello"), _assistant_text("world")]
    summary = _summarize_messages(messages)
    assert "Key timeline" in summary
    assert "user:" in summary
    assert "assistant:" in summary


def test_summarize_messages_wrapped_in_xml():
    summary = _summarize_messages([_user("test")])
    assert summary.startswith("<summary>")
    assert summary.endswith("</summary>")


# ---------------------------------------------------------------------------
# _merge_summaries
# ---------------------------------------------------------------------------

def test_merge_summaries_contains_both_sections():
    first = _summarize_messages([_user("first request"), _assistant_text("first response")])
    second = _summarize_messages([_user("second request"), _assistant_text("second response")])
    merged = _merge_summaries(first, second)
    assert "Previously compacted context" in merged
    assert "Newly compacted context" in merged


def test_merge_summaries_drops_timeline_from_prior():
    first = _summarize_messages([_user("step one"), _assistant_text("done one")])
    second = _summarize_messages([_user("step two"), _assistant_text("done two")])
    merged = _merge_summaries(first, second)
    # Timeline should come from new only (not duplicated from prior highlights)
    assert "Key timeline" in merged
    timeline_count = merged.count("Key timeline")
    assert timeline_count == 1


# ---------------------------------------------------------------------------
# _format_summary
# ---------------------------------------------------------------------------

def test_format_summary_strips_xml_tags():
    result = _format_summary("<summary>\nConversation summary:\n- Scope: 2.\n</summary>")
    assert "<summary>" not in result
    assert "</summary>" not in result
    assert "Summary:" in result
    assert "Scope: 2." in result


def test_format_summary_passthrough_if_no_tags():
    result = _format_summary("plain text summary")
    assert result == "plain text summary"


# ---------------------------------------------------------------------------
# _build_continuation_message
# ---------------------------------------------------------------------------

def test_build_continuation_message_structure():
    msg = _build_continuation_message("<summary>test summary</summary>")
    assert msg["role"] == "user"
    assert CONTINUATION_PREAMBLE in msg["content"]
    assert RECENT_MESSAGES_NOTE in msg["content"]
    assert "Resume directly" in msg["content"]
    assert "test summary" in msg["content"]


# ---------------------------------------------------------------------------
# HeuristicCompactor — end-to-end
# ---------------------------------------------------------------------------

def _make_messages(n: int) -> list[dict]:
    """Make n alternating user/assistant messages with enough content to exceed threshold."""
    msgs = []
    for i in range(n):
        role = "user" if i % 2 == 0 else "assistant"
        msgs.append({"role": role, "content": f"message {i} " + ("x" * 500)})
    return msgs


@pytest.mark.asyncio
async def test_maybe_compact_under_threshold_returns_same_list():
    compactor = HeuristicCompactor(max_tokens=10_000_000, preserve_recent=4)
    msgs = _make_messages(6)
    result = await compactor.maybe_compact(msgs)
    assert result is msgs  # same object, no copy


@pytest.mark.asyncio
async def test_maybe_compact_too_few_messages_returns_same_list():
    compactor = HeuristicCompactor(max_tokens=1, preserve_recent=10)
    msgs = _make_messages(4)
    result = await compactor.maybe_compact(msgs)
    assert result is msgs


@pytest.mark.asyncio
async def test_maybe_compact_injects_summary_and_preserves_recent():
    compactor = HeuristicCompactor(max_tokens=1, preserve_recent=2)
    msgs = _make_messages(6)
    result = await compactor.maybe_compact(msgs)
    # First message is synthetic summary
    assert result[0]["role"] == "user"
    assert CONTINUATION_PREAMBLE in result[0]["content"]
    # Last 2 messages are preserved verbatim
    assert result[1] == msgs[-2]
    assert result[2] == msgs[-1]
    assert len(result) == 3


@pytest.mark.asyncio
async def test_maybe_compact_total_shorter_than_original():
    compactor = HeuristicCompactor(max_tokens=1, preserve_recent=2)
    msgs = _make_messages(10)
    result = await compactor.maybe_compact(msgs)
    original_size = sum(len(json.dumps(m)) for m in msgs)
    result_size = sum(len(json.dumps(m)) for m in result)
    assert result_size < original_size


@pytest.mark.asyncio
async def test_maybe_compact_repeat_compaction_merges():
    compactor = HeuristicCompactor(max_tokens=1, preserve_recent=2)
    msgs = _make_messages(6)
    # First compaction
    first = await compactor.maybe_compact(msgs)
    # Add more messages and compact again
    extended = first + _make_messages(4)
    second = await compactor.maybe_compact(extended)
    assert "Previously compacted context" in second[0]["content"]
    assert "Newly compacted context" in second[0]["content"]
```

- [ ] **Step 2: Run tests (expect failures — implementations don't exist yet)**

```bash
cd agent && python -m pytest tests/test_runtime_compactor.py -v 2>&1 | head -40
```
Expected: `ImportError` or many `FAILED` — confirms tests are wired up correctly.

- [ ] **Step 3: Commit the failing tests**

```bash
git add agent/tests/test_runtime_compactor.py
git commit -m "test: write failing tests for HeuristicCompactor"
```

---

### Task 3: Implement `compactor.py` — constants, primitives, file extraction

**Files:**
- Modify: `agent/src/runtime/compactor.py` (full rewrite — start fresh)

- [ ] **Step 1: Write the new `compactor.py` with constants and primitive helpers**

```python
"""Context compaction — zero-dependency heuristic port of claw-code-2/compact.rs.

Replaces messages older than the preserve_recent window with a single synthetic
summary message built from pure string extraction. No API calls, no failure modes.
"""
from __future__ import annotations

import json
import os.path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CONTINUATION_PREAMBLE = (
    "This session is being continued from a previous conversation that ran out "
    "of context. The summary below covers the earlier portion of the conversation.\n\n"
)
RECENT_MESSAGES_NOTE = "Recent messages are preserved verbatim."
DIRECT_RESUME_INSTRUCTION = (
    "Continue the conversation from where it left off without asking the user any "
    "further questions. Resume directly — do not acknowledge the summary, do not "
    "recap what was happening, and do not preface with continuation text."
)

_FILE_EXTENSIONS = {".py", ".sql", ".json", ".md", ".ts", ".tsx", ".js"}
_PENDING_KEYWORDS = {"todo", "next", "pending", "follow up", "remaining", "epc", "contractor"}

# ---------------------------------------------------------------------------
# Primitive helpers
# ---------------------------------------------------------------------------


def _truncate(text: str, max_chars: int) -> str:
    """Return text truncated to max_chars with a trailing ellipsis if shortened."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "…"


def _estimate_tokens(messages: list[dict]) -> int:
    """Rough token estimate: one token per 4 characters of JSON-serialized message."""
    return sum(len(json.dumps(m, default=str)) for m in messages) // 4


def _extract_file_candidates(text: str) -> list[str]:
    """Extract unique file paths with known extensions from a block of text.

    Strips surrounding punctuation from each token, keeps tokens that contain
    a '/' and have one of the target extensions. Returns up to 8 unique paths.
    """
    seen: set[str] = set()
    result: list[str] = []
    for token in text.split():
        candidate = token.strip(",.;:)(\"'`")
        if "/" in candidate:
            _, ext = os.path.splitext(candidate)
            if ext.lower() in _FILE_EXTENSIONS and candidate not in seen:
                seen.add(candidate)
                result.append(candidate)
                if len(result) >= 8:
                    break
    return result
```

- [ ] **Step 2: Run the primitive helper tests only**

```bash
cd agent && python -m pytest tests/test_runtime_compactor.py -k "truncate or estimate_tokens or file_candidates" -v
```
Expected: all green (these tests only exercise the three helpers just written).

---

### Task 4: Implement text extraction helpers

**Files:**
- Modify: `agent/src/runtime/compactor.py` (append)

- [ ] **Step 1: Append these helpers to `compactor.py`**

```python
# ---------------------------------------------------------------------------
# Message text extraction
# ---------------------------------------------------------------------------


def _extract_first_text(message: dict) -> str | None:
    """Return the first non-empty text string from a message, or None.

    Handles both plain-string content and list-of-blocks content.
    Skips tool_use and tool_result blocks.
    """
    content = message.get("content", "")
    if isinstance(content, str):
        stripped = content.strip()
        return stripped if stripped else None
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text", "").strip()
                if text:
                    return text
    return None


def _extract_all_text(message: dict) -> str:
    """Return all text content from a message concatenated for file scanning."""
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            t = block.get("type")
            if t == "text":
                parts.append(block.get("text", ""))
            elif t == "tool_use":
                inp = block.get("input", {})
                parts.append(json.dumps(inp) if isinstance(inp, dict) else str(inp))
            elif t == "tool_result":
                c = block.get("content", "")
                parts.append(c if isinstance(c, str) else json.dumps(c, default=str))
        return " ".join(parts)
    return ""


def _summarize_message_content(message: dict) -> str:
    """Produce a short one-line summary of a message for the timeline section."""
    content = message.get("content", "")
    if isinstance(content, str):
        return _truncate(content, 160)
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            t = block.get("type")
            if t == "text":
                parts.append(_truncate(block.get("text", ""), 160))
            elif t == "tool_use":
                name = block.get("name", "?")
                inp = block.get("input", {})
                inp_str = json.dumps(inp) if isinstance(inp, dict) else str(inp)
                parts.append(f"tool_use {name}({_truncate(inp_str, 80)})")
            elif t == "tool_result":
                c = block.get("content", "")
                c_str = c if isinstance(c, str) else json.dumps(c, default=str)
                parts.append(f"tool_result: {_truncate(c_str, 80)}")
        return " | ".join(parts)
    return ""
```

- [ ] **Step 2: Run extraction helper tests**

```bash
cd agent && python -m pytest tests/test_runtime_compactor.py -k "extract_first_text" -v
```
Expected: all green.

---

### Task 5: Implement `_detect_existing_summary` and `_format_summary`

**Files:**
- Modify: `agent/src/runtime/compactor.py` (append)

- [ ] **Step 1: Append these helpers**

```python
# ---------------------------------------------------------------------------
# Summary formatting and detection
# ---------------------------------------------------------------------------


def _format_summary(summary: str) -> str:
    """Convert <summary>...</summary> XML to plain readable text.

    Strips the XML tags and prepends 'Summary:\\n'.
    Falls back to returning the string as-is if tags aren't present.
    """
    if "<summary>" in summary and "</summary>" in summary:
        start = summary.find("<summary>") + len("<summary>")
        end = summary.find("</summary>")
        inner = summary[start:end].strip()
        return "Summary:\n" + inner
    return summary.strip()


def _detect_existing_summary(message: dict) -> str | None:
    """Return the raw summary string if message is a prior compaction message, else None.

    A prior compaction message starts with CONTINUATION_PREAMBLE. The raw summary
    is extracted by stripping the preamble and trailing instruction text.
    """
    if message.get("role") != "user":
        return None
    content = message.get("content", "")
    if not isinstance(content, str) or not content.startswith(CONTINUATION_PREAMBLE):
        return None
    summary = content[len(CONTINUATION_PREAMBLE):]
    # Strip trailing "Recent messages" note and resume instruction
    split_note = f"\n\n{RECENT_MESSAGES_NOTE}"
    if split_note in summary:
        summary = summary.split(split_note)[0]
    split_resume = f"\n{DIRECT_RESUME_INSTRUCTION}"
    if split_resume in summary:
        summary = summary.split(split_resume)[0]
    return summary.strip()
```

- [ ] **Step 2: Run detection and format tests**

```bash
cd agent && python -m pytest tests/test_runtime_compactor.py -k "detect_existing or format_summary" -v
```
Expected: all green.

---

### Task 6: Implement `_summarize_messages`

**Files:**
- Modify: `agent/src/runtime/compactor.py` (append)

- [ ] **Step 1: Append `_summarize_messages`**

```python
# ---------------------------------------------------------------------------
# Core summarization
# ---------------------------------------------------------------------------


def _summarize_messages(messages: list[dict]) -> str:
    """Build a <summary> XML block from a list of messages via pure heuristics.

    Extracts: scope counts, tool names, recent user requests, pending-work text,
    key file paths, current work, and a per-message timeline.
    """
    user_count = sum(1 for m in messages if m.get("role") == "user")
    assistant_count = sum(1 for m in messages if m.get("role") == "assistant")

    # Collect tool names from tool_use blocks
    tool_names: set[str] = set()
    for m in messages:
        content = m.get("content", [])
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    tool_names.add(block.get("name", "unknown"))

    # Last 3 user text messages (skip existing summary messages)
    recent_user: list[str] = []
    for m in reversed(messages):
        if len(recent_user) >= 3:
            break
        if m.get("role") != "user":
            continue
        text = _extract_first_text(m)
        if text and not text.startswith(CONTINUATION_PREAMBLE):
            recent_user.append(_truncate(text, 160))
    recent_user.reverse()

    # Messages whose text contains pending-work keywords
    pending_work: list[str] = []
    for m in reversed(messages):
        if len(pending_work) >= 3:
            break
        text = _extract_first_text(m)
        if text:
            lowered = text.lower()
            if any(kw in lowered for kw in _PENDING_KEYWORDS):
                pending_work.append(_truncate(text, 160))
    pending_work.reverse()

    # Key files across all message content
    all_text = " ".join(_extract_all_text(m) for m in messages)
    key_files = _extract_file_candidates(all_text)

    # Current work: most recent non-empty text block
    current_work: str | None = None
    for m in reversed(messages):
        text = _extract_first_text(m)
        if text and not text.startswith(CONTINUATION_PREAMBLE):
            current_work = _truncate(text, 200)
            break

    # Key timeline: one line per message
    timeline: list[str] = []
    for m in messages:
        role = m.get("role", "unknown")
        content_str = _summarize_message_content(m)
        timeline.append(f"  - {role}: {content_str}")

    # Build XML block
    lines: list[str] = [
        "<summary>",
        "Conversation summary:",
        (
            f"- Scope: {len(messages)} earlier messages compacted "
            f"(user={user_count}, assistant={assistant_count})."
        ),
    ]
    if tool_names:
        lines.append(f"- Tools mentioned: {', '.join(sorted(tool_names))}.")
    if recent_user:
        lines.append("- Recent user requests:")
        lines.extend(f"  - {r}" for r in recent_user)
    if pending_work:
        lines.append("- Pending work:")
        lines.extend(f"  - {p}" for p in pending_work)
    if key_files:
        lines.append(f"- Key files referenced: {', '.join(key_files)}.")
    if current_work:
        lines.append(f"- Current work: {current_work}")
    lines.append("- Key timeline:")
    lines.extend(timeline)
    lines.append("</summary>")
    return "\n".join(lines)
```

- [ ] **Step 2: Run summarize tests**

```bash
cd agent && python -m pytest tests/test_runtime_compactor.py -k "summarize_messages" -v
```
Expected: all green.

---

### Task 7: Implement `_extract_highlights`, `_extract_timeline`, `_merge_summaries`

**Files:**
- Modify: `agent/src/runtime/compactor.py` (append)

- [ ] **Step 1: Append merge helpers**

```python
# ---------------------------------------------------------------------------
# Summary merging (for repeat compactions)
# ---------------------------------------------------------------------------


def _extract_highlights(summary: str) -> list[str]:
    """Return all non-timeline bullet lines from a summary string.

    Strips XML tags first, then skips the header lines and everything under
    '- Key timeline:'.
    """
    formatted = _format_summary(summary)
    lines: list[str] = []
    in_timeline = False
    for line in formatted.splitlines():
        stripped = line.rstrip()
        if not stripped or stripped in ("Summary:", "Conversation summary:"):
            continue
        if stripped == "- Key timeline:":
            in_timeline = True
            continue
        if in_timeline:
            continue
        lines.append(stripped)
    return lines


def _extract_timeline(summary: str) -> list[str]:
    """Return the timeline lines from a summary string (lines under '- Key timeline:')."""
    formatted = _format_summary(summary)
    lines: list[str] = []
    in_timeline = False
    for line in formatted.splitlines():
        stripped = line.rstrip()
        if stripped == "- Key timeline:":
            in_timeline = True
            continue
        if not in_timeline:
            continue
        if not stripped:
            break
        lines.append(stripped)
    return lines


def _merge_summaries(existing: str, new_summary: str) -> str:
    """Merge a prior compaction summary with a new one.

    Produces a <summary> block with:
    - "Previously compacted context" (highlights from existing, no timeline)
    - "Newly compacted context" (highlights from new_summary)
    - "Key timeline" (timeline from new_summary only)
    """
    prev_highlights = _extract_highlights(existing)
    new_highlights = _extract_highlights(new_summary)
    new_timeline = _extract_timeline(new_summary)

    lines: list[str] = ["<summary>", "Conversation summary:"]
    if prev_highlights:
        lines.append("- Previously compacted context:")
        lines.extend(f"  {line}" for line in prev_highlights)
    if new_highlights:
        lines.append("- Newly compacted context:")
        lines.extend(f"  {line}" for line in new_highlights)
    if new_timeline:
        lines.append("- Key timeline:")
        lines.extend(new_timeline)
    lines.append("</summary>")
    return "\n".join(lines)
```

- [ ] **Step 2: Run merge tests**

```bash
cd agent && python -m pytest tests/test_runtime_compactor.py -k "merge or highlights or timeline" -v
```
Expected: all green.

---

### Task 8: Implement `_build_continuation_message` and `HeuristicCompactor`

**Files:**
- Modify: `agent/src/runtime/compactor.py` (append)

- [ ] **Step 1: Append the continuation builder and the class**

```python
# ---------------------------------------------------------------------------
# Continuation message
# ---------------------------------------------------------------------------


def _build_continuation_message(summary: str) -> dict:
    """Wrap a summary in a user message for injection as the new conversation head."""
    formatted = _format_summary(summary)
    content = (
        f"{CONTINUATION_PREAMBLE}{formatted}"
        f"\n\n{RECENT_MESSAGES_NOTE}"
        f"\n{DIRECT_RESUME_INSTRUCTION}"
    )
    return {"role": "user", "content": content}


# ---------------------------------------------------------------------------
# Public compactor
# ---------------------------------------------------------------------------


class HeuristicCompactor:
    """Zero-dependency context compactor.

    Replaces messages older than preserve_recent with a single synthetic
    summary message built from pure string extraction. No API calls.

    Usage (same as the old Compactor):
        compactor = HeuristicCompactor(max_tokens=80_000, preserve_recent=6)
        messages = await compactor.maybe_compact(messages)
    """

    def __init__(
        self,
        max_tokens: int = 80_000,
        preserve_recent: int = 6,
    ) -> None:
        self.max_tokens = max_tokens
        self.preserve_recent = preserve_recent

    async def maybe_compact(self, messages: list[dict]) -> list[dict]:
        """Compact messages if context exceeds threshold.

        Returns the original list unchanged (same object) if under threshold
        or if there are not enough messages to compact.
        """
        if _estimate_tokens(messages) <= self.max_tokens:
            return messages
        if len(messages) <= self.preserve_recent:
            return messages

        older = messages[: -self.preserve_recent]
        recent = messages[-self.preserve_recent :]

        existing_summary = _detect_existing_summary(older[0]) if older else None
        new_summary = _summarize_messages(older)

        if existing_summary:
            merged = _merge_summaries(existing_summary, new_summary)
        else:
            merged = new_summary

        return [_build_continuation_message(merged)] + recent
```

- [ ] **Step 2: Run all tests**

```bash
cd agent && python -m pytest tests/test_runtime_compactor.py -v
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add agent/src/runtime/compactor.py agent/tests/test_runtime_compactor.py
git commit -m "feat: replace Haiku compactor with zero-dependency HeuristicCompactor"
```

---

### Task 9: Update callers — remove `api_key` kwarg

**Files:**
- Modify: `agent/src/agents/chat.py`
- Modify: `agent/src/agents/research.py`

- [ ] **Step 1: Open `chat.py` and find the `HeuristicCompactor` instantiation**

The current line looks like:
```python
compactor=Compactor(max_tokens=80_000, preserve_recent=6, api_key=api_key),
```

Replace with:
```python
compactor=HeuristicCompactor(max_tokens=80_000, preserve_recent=6),
```

Also update the import at the top of the file — change:
```python
from runtime.compactor import Compactor
```
to:
```python
from runtime.compactor import HeuristicCompactor
```

- [ ] **Step 2: Open `research.py` and do the same**

Current line:
```python
compactor=Compactor(max_tokens=60_000, preserve_recent=4, api_key=api_key),
```

Replace with:
```python
compactor=HeuristicCompactor(max_tokens=60_000, preserve_recent=4),
```

Update the import from `Compactor` to `HeuristicCompactor`.

- [ ] **Step 3: Verify no remaining references to old `Compactor` class**

```bash
cd agent && grep -rn "from runtime.compactor import Compactor\|Compactor(" src/ tests/
```
Expected: no output (zero matches).

- [ ] **Step 4: Run the full test suite**

```bash
cd agent && python -m pytest tests/ -v 2>&1 | tail -20
```
Expected: all green, no import errors.

- [ ] **Step 5: Commit**

```bash
git add agent/src/agents/chat.py agent/src/agents/research.py
git commit -m "refactor: update chat and research agents to use HeuristicCompactor"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite one more time, confirm zero failures**

```bash
cd agent && python -m pytest tests/ -v 2>&1 | tail -30
```
Expected output ends with something like `X passed, 0 failed`.

- [ ] **Step 2: Confirm `anthropic` is no longer imported in `compactor.py`**

```bash
grep "anthropic" agent/src/runtime/compactor.py
```
Expected: no output.

- [ ] **Step 3: Confirm `compaction.py` is gone**

```bash
ls agent/src/compaction.py 2>&1
```
Expected: `No such file or directory`.

- [ ] **Step 4: Final commit**

```bash
git add -u
git commit -m "chore: final cleanup — heuristic compaction complete"
```
