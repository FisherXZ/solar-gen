"""Sanitize conversation parts for public share pages.

Allow-list model: only tools in SHAREABLE_TOOLS survive. Unknown tools are
dropped silently so new internal tools fail closed by default.
"""

from __future__ import annotations

from typing import Any

# Tools whose output is safe to expose on a public share page.
# Everything else (research_scratchpad, remember, recall, query_knowledge_base,
# approve_discovery, and any future tool) is hidden by default.
SHAREABLE_TOOLS: frozenset[str] = frozenset(
    {
        "web_search",
        "web_search_broad",
        "fetch_page",
        "search_projects",
        "search_projects_with_epc",
        "research_epc",
        "report_findings",
        "get_discoveries",
        "request_discovery_review",
        "request_guidance",
        "notify_progress",
        "batch_research_epc",
        "export_csv",
    }
)


def _tool_name(part: dict[str, Any]) -> str | None:
    """Extract tool name from a UIMessage part, handling both shapes."""
    name = part.get("toolName")
    if isinstance(name, str):
        return name
    ptype = part.get("type")
    if isinstance(ptype, str) and ptype.startswith("tool-"):
        return ptype[5:]
    return None


def _strip_internal_fields(part: dict[str, Any]) -> dict[str, Any]:
    """Remove underscore-prefixed input keys; truncate stack traces in output."""
    clean = dict(part)

    inp = clean.get("input")
    if isinstance(inp, dict):
        clean["input"] = {k: v for k, v in inp.items() if not k.startswith("_")}

    out = clean.get("output")
    if isinstance(out, dict) and "error" in out:
        err = out.get("error")
        if isinstance(err, str) and "Traceback" in err:
            clean["output"] = {**out, "error": "An error occurred"}

    return clean


def sanitize_parts(parts: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Filter message parts to a public-safe subset.

    Rules:
    - Text parts pass through unchanged.
    - Tool parts pass only if the tool name is in SHAREABLE_TOOLS,
      with underscore-prefixed input keys stripped and error tracebacks
      replaced by a generic message.
    - File parts and all other types (reasoning, step-start, source-url, etc.)
      are dropped.
    """
    if not parts:
        return []

    out: list[dict[str, Any]] = []
    for part in parts:
        if not isinstance(part, dict):
            continue

        ptype = part.get("type")
        if ptype == "text":
            out.append(part)
            continue

        name = _tool_name(part)
        if name and name in SHAREABLE_TOOLS:
            out.append(_strip_internal_fields(part))
            continue

        # Everything else: dropped.

    return out


def sanitize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply part sanitization to a list of chat messages.

    Preserves message id/role/content/created_at; replaces parts with the
    filtered version.
    """
    clean: list[dict[str, Any]] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        parts = m.get("parts")
        if not isinstance(parts, list):
            parts = []
        clean.append(
            {
                "id": m.get("id"),
                "role": m.get("role"),
                "content": m.get("content", ""),
                "parts": sanitize_parts(parts),
                "created_at": m.get("created_at"),
            }
        )
    return clean
