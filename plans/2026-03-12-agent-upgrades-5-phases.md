# Agent Upgrades: 5 Phases

**Date:** 2026-03-12
**Reference:** `plans/2026-03-12-deep-dive-harvey-claude-manus.md`
**Goal:** Close the gaps between our agent and Harvey AI / Manus AI / Claude Code patterns

---

## Plain English

We're making five upgrades to our research agent, each one building on the last. First, we stop wasting money on API calls by fixing how we handle token caching (Phase 1). Then we let users actually see what the agent is doing during research (Phase 2). Next, we teach the agent to evaluate whether its own research is good enough before reporting (Phase 3). After that, we add a fact-checking step that re-reads sources to confirm they actually say what the agent claims (Phase 4). Finally, we give the agent a filing cabinet — instead of throwing away old search results when the conversation gets too long, we file them to disk and leave sticky notes so the agent can find them again (Phase 5).

---

## Phase 1: KV-Cache Optimization

**Inspired by:** Manus AI's 5 cache rules, Claude Code's "cache misses are production incidents"

**Why:** Cached tokens cost 10x less than uncached. A single token change in the prefix invalidates everything downstream. We're likely paying full price on most of our research tokens because compaction rewrites old messages mid-prefix.

### What to Change

#### 1a. Deterministic JSON serialization
**Files:** Every `json.dumps()` call that produces tool results fed back to the API.

- `agent/src/tools/__init__.py:98` — `execute_tool` return values get `json.dumps(result)` in `research.py:204` and `chat_agent.py:314`. Add `sort_keys=True` to all these serialization points.
- `agent/src/research.py:204` — `json.dumps(result)` → `json.dumps(result, sort_keys=True)`
- `agent/src/chat_agent.py:314` — same change
- `agent/src/compaction.py:119` — `json.dumps(stub)` → `json.dumps(stub, sort_keys=True)`

#### 1b. Lock tool definitions — send all tools every time
**Files:** `agent/src/research.py`, `agent/src/chat_agent.py`

Currently `research.py` sends only `RESEARCH_TOOLS` (7 tools) while `chat_agent.py` sends all 17. This means the cached prefix differs between research and chat — two separate cache entries.

**Change:** Always send all tools in both paths. In the research system prompt, add a line: "You have access to research tools only: web_search, web_search_broad, fetch_page, query_knowledge_base, notify_progress, research_scratchpad, report_findings. Do not call other tools." This is the "tool masking via prompt" pattern from Manus — tool definitions stay constant, but instructions limit usage.

Update `research.py`:
```python
# Before
tools = get_tools(RESEARCH_TOOLS)
# After
tools = get_all_tools()  # Same as chat — stable cache prefix
```

#### 1c. Log cache metrics
**Files:** `agent/src/research.py`, `agent/src/chat_agent.py`

The Anthropic API returns `cache_read_input_tokens` and `cache_creation_input_tokens` in the usage object. We currently log `input_tokens` and `output_tokens` but ignore cache metrics.

**Change:** Add to the agent_log entry:
```python
agent_log.append({
    "iteration": iteration,
    "stop_reason": response.stop_reason,
    "input_tokens": response.usage.input_tokens,
    "output_tokens": response.usage.output_tokens,
    "cache_read": getattr(response.usage, "cache_read_input_tokens", 0),
    "cache_creation": getattr(response.usage, "cache_creation_input_tokens", 0),
})
```

Add a summary log line at end of research:
```python
total_cache_read = sum(e.get("cache_read", 0) for e in agent_log if "cache_read" in e)
total_cache_creation = sum(e.get("cache_creation", 0) for e in agent_log if "cache_creation" in e)
cache_rate = total_cache_read / max(total_cache_read + total_cache_creation, 1)
logger.info("Cache hit rate: %.1f%% (%d read / %d created)", cache_rate * 100, total_cache_read, total_cache_creation)
```

#### 1d. Move compaction threshold up and make it append-only
**Files:** `agent/src/research.py`, `agent/src/compaction.py`

Currently `research.py:240` compacts at 300K chars. But compaction rewrites old messages, which breaks cache prefix matching from the rewrite point.

**Change for now:** Raise threshold to avoid compaction during most research runs (25 iterations rarely hit 300K). Move the compaction from "replace content in-place" to "append a summary message" pattern — addressed fully in Phase 5.

### Verification
- Run a batch of 5 projects before and after. Compare `cache_read` / `cache_creation` ratios in logs.
- Expect: cache hit rate should jump from near-0% to 60-80% on tool definitions + system prompt.

### Files Touched
- `agent/src/research.py`
- `agent/src/chat_agent.py`
- `agent/src/compaction.py`
- `agent/src/prompts.py` (add tool restriction note to research prompt)

---

## Phase 2: Research Transparency

**Inspired by:** Harvey AI's thinking states — plan, intermediate results, intervention points, paper trail

**Why:** During research (standalone or batch), users see `notify_progress` status badges ("Searching...", "Verifying...") but no substance. They can't see which searches found what, which leads were abandoned, or why the agent chose a particular EPC. This kills trust.

### What to Change

#### 2a. New SSE event type: `research-trail`
**Files:** `agent/src/sse.py`

Add a new method to `StreamWriter`:
```python
def research_trail(self, trail_data: dict) -> str:
    """Emit research trail update for transparency UI."""
    return _event({
        "type": "tool-output-available",
        "toolCallId": f"trail-{self._next_id()}",
        "output": {"_type": "research_trail", **trail_data},
    })
```

The `trail_data` schema:
```json
{
  "_type": "research_trail",
  "searches": [
    {"query": "...", "result_count": 5, "epc_mentions": ["McCarthy", "Blattner"]}
  ],
  "pages_read": [
    {"url": "...", "title": "...", "relevant": true, "excerpt": "..."}
  ],
  "candidates": [
    {"name": "McCarthy Building", "evidence_count": 2, "status": "investigating"}
  ],
  "dead_ends": [
    {"name": "Sundt Construction", "reason": "Wrong scale — commercial only"}
  ],
  "phase": "Phase 2 — EPC Portfolio Sweep",
  "iteration": 8
}
```

#### 2b. Emit trail data from `research_scratchpad` writes
**Files:** `agent/src/research.py`, `agent/src/chat_agent.py`

When the agent calls `research_scratchpad` with `operation: "write"`, the tool already stores structured data (candidates, dead_ends, sources). After executing the scratchpad write, emit the current scratchpad state as a `research_trail` event.

In `research.py` (standalone/batch): collect scratchpad state and pass to the `on_progress` callback so batch progress tracking includes the trail.

In `chat_agent.py`: emit the trail as an SSE event directly.

#### 2c. New frontend component: `ResearchTrailCard.tsx`
**Files:** `frontend/src/components/chat/parts/ResearchTrailCard.tsx`

A collapsible card (default collapsed) that renders the research trail. Design per `DESIGN.md`:
- Warm dark card background (`bg-stone-900/60`)
- Amber accent for EPC candidate names
- Collapsible sections: Searches | Pages Read | Candidates | Dead Ends
- Each search shows query text + result count + any EPC names mentioned
- Each candidate shows name + evidence count + status badge (investigating / confirmed / eliminated)
- Dead ends show name + reason in muted text
- Phase indicator at top ("Phase 2 of 3 — EPC Portfolio Sweep")

Wire into `ToolPart.tsx` — when `toolName === "research_scratchpad"` and the output contains `_type: "research_trail"`, render `ResearchTrailCard` instead of the generic tool card.

#### 2d. Enrich batch progress with trail snapshots
**Files:** `agent/src/batch_progress.py`, `frontend/src/components/chat/parts/BatchProgressCard.tsx`

Add an optional `trail` field to `ProjectState` in `batch_progress.py`. When a standalone research run completes, include a summary trail (searches performed, candidates found, final reasoning) in the progress update.

In `BatchProgressCard.tsx`, add a clickable row that expands to show the trail for each completed project.

### Verification
- Run a single project research from the chat. Confirm the trail card appears and updates as the agent searches.
- Run a 3-project batch. Confirm each project row in BatchProgressCard can expand to show its trail.

### Files Touched
- `agent/src/sse.py` (new method)
- `agent/src/research.py` (emit trail after scratchpad writes)
- `agent/src/chat_agent.py` (emit trail SSE events)
- `agent/src/batch_progress.py` (add trail field)
- `frontend/src/components/chat/parts/ResearchTrailCard.tsx` (new)
- `frontend/src/components/chat/parts/BatchProgressCard.tsx` (expand rows)
- `frontend/src/components/chat/parts/ToolPart.tsx` (route to ResearchTrailCard)

---

## Phase 3: Confidence Self-Evaluation

**Inspired by:** Harvey AI's grade + confidence-in-grade, completeness loop driving "do I have enough?"

**Why:** Our current checkpoints (`completeness.py`) are iteration-based timers with deterministic heuristics. They check *what the agent did* (search count, portfolio checks) but never ask *how good the results are*. A search that found 3 conflicting EPCs gets the same treatment as one that found nothing.

### What to Change

#### 3a. New module: `agent/src/self_eval.py`
A focused LLM call at checkpoints that evaluates research quality. Separate from the main research loop — uses a cheap model (Haiku) to keep costs low.

```python
async def evaluate_research_quality(
    project: dict,
    scratchpad_state: dict,  # Current candidates, dead_ends, sources
    searches_performed: list[str],
    iteration: int,
) -> dict:
    """LLM-based research quality evaluation.

    Returns:
        {
            "completeness": 1-5,        # How thorough was the search?
            "confidence_justified": 1-5, # Is the current confidence level warranted?
            "missing_angles": [...],     # Specific searches not yet tried
            "recommendation": "continue" | "wrap_up" | "try_specific",
            "specific_suggestions": [...]  # e.g. "Search for [developer] financial close announcement"
        }
    """
```

The evaluation prompt (~300 tokens):
```
You are evaluating EPC research quality for a solar project.

Project: {name}, {capacity}MW, {state}, Developer: {developer}

Research so far:
- Searches: {count} performed
- Candidates found: {candidates}
- Dead ends: {dead_ends}
- Sources: {sources}

Rate 1-5:
1. Completeness: Have all major search angles been tried? (direct search, EPC portfolios, trade pubs, regulatory filings)
2. Confidence justification: Given the evidence found, is the current assessment warranted?

List any specific missing search angles.
Respond as JSON.
```

Cost: ~500 input + ~200 output tokens per call × Haiku pricing = ~$0.0003 per evaluation. At 3 checkpoints per research = ~$0.001 per project. Negligible.

#### 3b. Integrate into `completeness.py`
**Files:** `agent/src/completeness.py`

Replace the current purely-heuristic evaluation at checkpoints with a hybrid approach:
1. Run existing heuristic checks (fast, free)
2. If heuristic says "continue" but iteration >= 6, also run `evaluate_research_quality`
3. Use the LLM evaluation's `missing_angles` to build specific injection messages instead of generic "have you completed Phase 2?"

The checkpoint message becomes actionable:
```
RESEARCH CHECKPOINT (iteration 7 of 25):
Searches: 5 | Pages: 3 | Portfolio checks: 1 | KB: yes
Self-evaluation: Completeness 2/5, Confidence justification 3/5
Missing angles:
- No search for regulatory filings (try "[project name] IURC" or "[project name] PUC")
- Only 1 EPC portfolio checked — try site:blattnerenergy.com and site:mortenson.com
- No trade publication searches (try "Solar Power World [developer]")
```

#### 3c. Add `searches_performed` to scratchpad writes
**Files:** `agent/src/research.py`

Currently the agent decides what to write to the scratchpad. To feed the self-eval, we need a reliable list of searches performed. Track all `web_search` and `web_search_broad` queries in the research runner and pass them to the eval.

Add a `searches_performed: list[str]` accumulator in `run_research()` that appends every search query. Pass this to `evaluate_research_quality` at checkpoints.

#### 3d. Store eval results in agent_log
The self-eval output goes into `agent_log` alongside the existing completeness check:
```python
agent_log.append({
    "completeness_check": check,
    "self_eval": eval_result,  # from evaluate_research_quality
})
```

This becomes visible in the Research Trail (Phase 2) — users can see the agent evaluating itself.

### Verification
- Run research on a project where the EPC is known. Check that self-eval at iteration 6 identifies any missing search angles.
- Run on a project with no EPC info. Confirm self-eval at iteration 12 recommends wrap_up with "unknown" and doesn't push for more searches.
- Check Haiku costs in logs — should be < $0.01 per research run.

### Files Touched
- `agent/src/self_eval.py` (new)
- `agent/src/completeness.py` (integrate LLM eval)
- `agent/src/research.py` (track searches_performed, pass to eval)

---

## Phase 4: Citation Verification

**Inspired by:** Harvey AI's 3-stage pipeline (metadata extraction → retrieval → binary LLM matching), 95%+ accuracy

**Why:** Our agent reports "EPC is X" with sources, but we never verify that cited URLs actually support the claim. A hallucinated citation looks identical to a real one. This is the #1 trust gap.

### What to Change

#### 4a. New module: `agent/src/citation_verify.py`

A post-research verification step that runs after `report_findings` but before the result is stored in the DB.

```python
async def verify_citations(
    result: AgentResult,
    project: dict,
) -> tuple[AgentResult, list[dict]]:
    """Verify each source in an AgentResult actually supports the claim.

    For each source with a URL:
    1. Re-fetch the page (use cached version if available)
    2. Extract the relevant passage
    3. Binary LLM check: "Does this text confirm [EPC] is contractor for [project]?"

    Returns:
        (updated_result, verification_log)

    The updated_result may have:
    - Sources annotated with verified=True/False
    - Confidence downgraded if citations don't verify
    - A verification_summary added to reasoning
    """
```

#### 4b. Three-step verification per source

**Step 1 — Re-fetch and extract:**
Use `fetch_page.execute({"url": source.url})` (our existing tool, already has 4KB truncation and trafilatura extraction). This reuses the existing 1h Tavily cache for recently-fetched pages.

**Step 2 — Extract relevant passage:**
Search the fetched text for the EPC name and project name. Extract a ±200 char window around the best match. If no match found, flag as `unverified`.

**Step 3 — Binary LLM verification:**
A focused Haiku call (~200 tokens):
```
Source text: "{passage}"
Claim: "{epc_name} is the EPC contractor for {project_name} ({capacity}MW) in {state}"

Does this source text confirm the claim? Answer ONLY with:
{"verified": true/false, "reason": "one sentence"}
```

Cost: ~300 tokens per source × Haiku pricing = ~$0.0001. Typical 3 sources = ~$0.0003 per verification. Negligible.

#### 4c. Annotate sources with verification status
**Files:** `agent/src/models.py`

Add to `EpcSource`:
```python
class EpcSource(BaseModel):
    # ... existing fields ...
    verified: bool | None = None  # None = not yet verified
    verification_reason: str | None = None
```

#### 4d. Confidence adjustment based on verification

In `citation_verify.py`, after verifying all sources:
- If ALL sources with URLs verify → no change
- If SOME don't verify → add warning to `confidence_warning`
- If NO sources verify → downgrade confidence by one level (e.g., likely → possible)
- If no sources have URLs (e.g., all `search:` prefix) → skip verification, add note

#### 4e. Wire into research pipeline
**Files:** `agent/src/research.py`, `agent/src/chat_agent.py`

In `research.py`, after `parse_report_findings`:
```python
if report_result is not None:
    # Phase 4: Verify citations before returning
    report_result, verify_log = await verify_citations(report_result, project)
    agent_log.extend(verify_log)
    return report_result, agent_log, total_tokens
```

In `chat_agent.py`, after `_handle_report_findings`:
```python
# Similar — verify before storing to DB
```

#### 4f. Frontend: verification badges
**Files:** `frontend/src/components/chat/parts/DiscoveryApprovalCard.tsx`

Add a small badge next to each source in the discovery review card:
- Green checkmark: `verified: true`
- Amber warning: `verified: false` with tooltip showing `verification_reason`
- Gray dash: `verified: null` (not checked — no URL)

### Verification
- Run research on a project where EPC is publicly known. All sources should verify.
- Manually test with a fake source URL. Should flag as unverified.
- Check that confidence downgrades happen correctly when citations fail.

### Files Touched
- `agent/src/citation_verify.py` (new)
- `agent/src/models.py` (add verified fields to EpcSource)
- `agent/src/research.py` (wire in verification)
- `agent/src/chat_agent.py` (wire in verification)
- `frontend/src/components/chat/parts/DiscoveryApprovalCard.tsx` (badges)

---

## Phase 5: File-as-Memory (Lossless Compaction)

**Inspired by:** Manus AI's "file system as unlimited memory" — write results to disk, keep only references in context, re-read when needed

**Why:** Our current compaction (`compaction.py`) replaces large tool results with `{"_compacted": true, "summary": "..."}` — the original data is gone. If the agent needs to revisit a search result from iteration 3, it must re-search (wasting time and money). Manus agents just read the file.

### What to Change

#### 5a. Tool result offloading to Supabase
**Files:** `agent/src/compaction.py`

Instead of replacing content with a lossy stub, write the full content to Supabase (`research_scratchpad` table, which already exists) and replace with a reference stub:

```python
def _compact_tool_result_v2(content_str: str, tool_name: str, session_id: str, tool_call_id: str) -> str:
    """Offload large tool result to storage, return reference stub."""
    # Write full content to Supabase scratchpad
    ref_key = f"compacted/{tool_call_id}"
    upsert_scratch(session_id, ref_key, {"content": content_str, "tool": tool_name})

    # Build reference stub (same format as before, but with recovery path)
    summary = _extract_summary(content_str, tool_name)  # existing logic
    stub = {
        "_compacted": True,
        "_recoverable": True,
        "tool": tool_name,
        "summary": summary,
        "ref_key": ref_key,
        "session_id": session_id,
    }
    return json.dumps(stub, sort_keys=True)
```

#### 5b. New tool: `read_compacted`
**Files:** `agent/src/tools/read_compacted.py` (new)

A lightweight tool the agent can call to recover compacted results:

```python
DEFINITION = {
    "name": "read_compacted",
    "description": (
        "Recover a previously compacted tool result. Use when you see "
        "a compacted stub and need the original data. Provide the ref_key "
        "and session_id from the stub."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "ref_key": {"type": "string"},
        },
        "required": ["session_id", "ref_key"],
    },
}

async def execute(tool_input: dict) -> dict:
    entries = read_scratch(tool_input["session_id"], key=tool_input["ref_key"])
    if entries:
        return entries[0].get("value", {}).get("content", {"error": "Content not found"})
    return {"error": "Compacted result not found — may have expired"}
```

Register in `tools/__init__.py`. Add to all tool lists (research + chat).

#### 5c. Three-tier compaction strategy
**Files:** `agent/src/compaction.py`

Implement Manus's graduated approach:

| Tier | Trigger | Action | Reversible? |
|------|---------|--------|-------------|
| **Raw** | Content < threshold (500 chars) | Keep as-is | N/A |
| **Compact** | Content > threshold, context > 200K chars | Offload to Supabase, leave reference stub | Yes — `read_compacted` |
| **Summarize** | Context still too large after compaction | LLM summary of remaining content (last resort) | No |

Tier 3 (summarization) uses a Haiku call to generate a structured summary:
```
Summarize this tool result for an EPC research agent. Keep: company names,
project names, confidence levels, URLs, key dates. Drop: full page text,
HTML artifacts, boilerplate.

Tool: {tool_name}
Content: {content[:2000]}

Respond as JSON: {"summary": "...", "key_entities": [...], "key_urls": [...]}
```

#### 5d. Update system prompt with compaction awareness
**Files:** `agent/src/prompts.py`

Add to the research instructions:
```
## Compacted Results
When you see a tool result with `"_compacted": true, "_recoverable": true`,
the full data has been saved. If you need the original content, call
`read_compacted` with the provided session_id and ref_key. Do NOT re-search
— the saved data is authoritative.
```

#### 5e. Cleanup: expire old scratchpad entries
**Files:** `agent/src/db.py`

Add a cleanup function that deletes `compacted/*` scratchpad entries older than 24 hours. Call it on server startup and periodically (e.g., on each batch completion).

```python
def cleanup_old_scratchpad(hours: int = 24) -> int:
    """Delete scratchpad entries older than `hours`. Returns count deleted."""
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
    result = supabase.table("research_scratchpad").delete().lt("created_at", cutoff).execute()
    return len(result.data) if result.data else 0
```

### Verification
- Run a long research (force low compaction threshold). Verify compacted stubs have `_recoverable: true`.
- Have the agent call `read_compacted` — confirm it gets the original content back.
- Run a 25-iteration research. Compare token usage with and without file-as-memory (should see fewer re-searches).

### Files Touched
- `agent/src/compaction.py` (3-tier strategy, offload to Supabase)
- `agent/src/tools/read_compacted.py` (new)
- `agent/src/tools/__init__.py` (register new tool)
- `agent/src/prompts.py` (compaction awareness instructions)
- `agent/src/db.py` (cleanup function)
- `agent/src/research.py` (pass session_id to compaction)

---

## Dependency Order

```
Phase 1 (KV-Cache) ──→ Phase 2 (Transparency) ──→ Phase 3 (Self-Eval)
                                                        │
                                                        ▼
                                                   Phase 4 (Citation Verify)
                                                        │
                                                        ▼
                                                   Phase 5 (File-as-Memory)
```

- **Phase 1** is standalone — pure cost optimization, no behavioral changes
- **Phase 2** introduces the trail UI that Phase 3's self-eval results display in
- **Phase 3** requires Phase 2's trail to show eval results to users
- **Phase 4** is independent of Phase 3 but benefits from Phase 1's cache savings (verification re-fetches pages)
- **Phase 5** depends on Phase 1 (cache-aware compaction) and integrates with Phase 2 (trail shows compaction status)

## Estimated Token Cost Impact

| Phase | Extra Cost per Research | Savings |
|-------|----------------------|---------|
| 1. KV-Cache | $0 | −60-80% on input tokens |
| 2. Transparency | $0 (uses existing tool outputs) | — |
| 3. Self-Eval | +$0.001 (3 Haiku calls) | Fewer wasted iterations |
| 4. Citation Verify | +$0.001 (3 Haiku calls + re-fetches) | Fewer false positives |
| 5. File-as-Memory | +$0.0005 (Supabase writes) | Fewer re-searches |
