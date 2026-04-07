# Agent Context Management Design
_2026-04-06_

## Problem

The chat agent loses track of what it has already discovered across conversation turns. After finding entity IDs and contact lists in turn N, it re-runs `query_knowledge_base`, `find_contacts`, and sometimes `search_projects` again in turn N+1 — even when the data is available in the conversation history. This causes:

- 2–4 redundant tool calls per turn (wasted latency + tokens)
- Persona/filter drift: contacts re-discovered with default criteria instead of saved persona
- User confusion: "why are you rerunning searchlinkedin contacts are here"
- After context compaction, IDs that were in messages are gone — no fallback

Root cause: the system prompt describes a **rigid phase workflow** (Plan → Execute → Report) that the agent restarts from scratch each turn, and there is no mechanism to propagate working state (discovered entity IDs, contact IDs, active persona) across turns or compaction boundaries.

---

## Design Goals

1. Agent never re-queries entity IDs or contact IDs already found in the current session
2. Persona/filter criteria persist from `remember` → into subsequent `find_contacts` calls
3. State survives context compaction (DB-backed, not just conversation history)
4. Confidence-gated EPC approval: ≥0.8 auto-accepts, <0.8 asks the user
5. Tool selection is declarative (condition-based) rather than imperative (phase-based)

---

## Architecture

### Layer 1: Session Working State (per-turn DB injection)

A DB-backed session state block is computed before each API call and prepended to the system prompt. The agent reads it as authoritative context; it never needs to re-discover what is already there.

**What it contains:**

```
## Session Working State
_Auto-generated from database — do not rely on conversation history for these IDs_

### Known Entities (this session)
- McCarthy Building Companies → entity_id: <uuid>
- SOLV Energy → entity_id: <uuid>

### Found Contacts (this session)
- McCarthy Building Companies (6 contacts):
  - Jake Ford, Civil Superintendent → contact_id: <uuid>
  - Robert Becky, Director of PM → contact_id: <uuid>
  ...

### Active Persona
Field Leader: Civil Superintendent, Director of PM, Survey Manager

### Recent Discoveries (pending review)
- Project TX-1234: SOLV Energy → EPC: McCarthy, confidence=likely (discovery_id: <uuid>)
```

**DB source:** A `session_working_state` table (or view over existing tables):
- `entity_id` for companies touched in this `conversation_id`
- `contact_id` list for each entity with contacts found
- Active persona from latest `remember(key="persona", ...)` call
- Pending discoveries from `epc_discoveries` WHERE status='pending' AND session_id=...

**Injection point:** `AgentRuntime._call_api()` receives a `dynamic_system_block` parameter (optional). If present, it is prepended to `_cached_system` as a plain (non-cached) text block.

**Cost:** The dynamic block is ~500–800 tokens; it is not cache-eligible (changes every turn). The static CHAT_SYSTEM_PROMPT remains cached. Net overhead is the dynamic block tokens × turns — acceptable for a 50-turn session.

**This is realistic and matches the claw-code-2 pattern:** `build_system_init_message()` in claw-code-2 constructs a runtime-computed block from live state (setup, commands, tools) and injects it at session start. Our version does the same per-turn from DB queries instead of at-start from process state.

---

### Layer 2: Declarative Tool Registry (replace Phase 1/2/3 workflow)

The current `CHAT_SYSTEM_PROMPT` describes three phases (Planning, Execution, Review & Approval) as an imperative workflow. The agent interprets this as "always start at Phase 1" regardless of turn position.

Replace with a **declarative tool registry**: a table of conditions and the tool they trigger.

**Format:**

```
## When to Use Each Tool

| Condition | Tool | Notes |
|-----------|------|-------|
| User asks about projects | search_projects | primary project tool |
| Entity ID NOT in Session Working State | query_knowledge_base | to get the UUID |
| Entity ID IS in Session Working State | — | use it directly, skip re-query |
| Contacts NOT in Session Working State for entity | find_contacts(entity_id, persona from SWS) | |
| Contacts ARE in Session Working State | — | use stored contact_ids |
| User wants to enrich a contact | enrich_contact_*(contact_id from SWS) | never re-discover |
| User asks to push to HubSpot | push_to_hubspot(project_id) | uses stored contacts |
| User mentions a persona | remember(key="persona", value=...) then update SWS | |
| Researching new EPC | web_search + fetch_page + report_findings | |
| EPC confidence ≥ 0.8 | auto-call approve_discovery(action="accepted") | no user prompt needed |
| EPC confidence < 0.8 | request_discovery_review | ask user first |
```

This replaces lines 342–376 of `prompts.py` (the three-phase Research Process block). Simple queries that don't involve EPC research (list projects, recall memories) already skip the phased process — that exception remains.

---

### Layer 3: Confidence-Gated EPC Approval

Current behavior: every discovery calls `request_discovery_review` and waits for the user.

New behavior:
- `report_findings` confidence ∈ {`confirmed`, `likely`} (maps to ≥ 0.8): agent immediately calls `approve_discovery(action="accepted")` — no user prompt
- `report_findings` confidence ∈ {`possible`, `unknown`} (maps to < 0.8): agent calls `request_discovery_review` and waits

This is a prompt-only change — no code change needed for the threshold check. The declarative tool registry (Layer 2) encodes the condition.

---

### Layer 4: Compactor Upgrade (ID preservation)

The `HeuristicCompactor` summarizes old messages when context exceeds 80k tokens. Currently, summaries are generated by the compactor's LLM call using a generic "summarize this" prompt.

Upgrade: add an ID-preservation instruction to the compactor prompt:

> "When summarizing, ALWAYS include a structured list of: entity names → entity_ids, contact names → contact_ids, and project_ids that were referenced. These IDs are critical operational state and must not be lost in compression."

This ensures that after compaction, the DB injection (Layer 1) can re-hydrate from DB rather than relying on compacted history — and if compaction runs before a DB write, the IDs are preserved in the summary.

---

## Implementation Plan

### 1. DB: `session_working_state` view

New Supabase migration. Query:

```sql
CREATE OR REPLACE VIEW session_working_state AS
SELECT
  c.conversation_id,
  jsonb_agg(DISTINCT jsonb_build_object('name', e.name, 'entity_id', e.id)) AS entities,
  jsonb_agg(DISTINCT jsonb_build_object(
    'entity_id', cont.entity_id,
    'contact_id', cont.id,
    'name', cont.name,
    'title', cont.title
  )) AS contacts,
  (SELECT value FROM agent_memory
   WHERE conversation_id = c.conversation_id AND key = 'persona'
   ORDER BY created_at DESC LIMIT 1) AS active_persona
FROM conversations c
LEFT JOIN epc_discoveries d ON d.session_id = c.conversation_id
LEFT JOIN entities e ON e.id = d.entity_id
LEFT JOIN contacts cont ON cont.entity_id = e.id
  AND cont.conversation_id = c.conversation_id
GROUP BY c.conversation_id;
```

(Exact schema TBD based on actual table structure — may need joins through `research_sessions` or `save_contact` records.)

### 2. Backend: `build_session_state_block(conversation_id)` function

New module: `agent/src/session_state.py`

```python
async def build_session_state_block(conversation_id: str) -> str | None:
    """Query DB for session working state; return markdown block or None if empty."""
    ...
```

Returns `None` if no state exists yet (first turn), so Layer 1 is a no-op on turn 1.

### 3. AgentRuntime: per-turn injection

Modify `run_turn` signature:

```python
async def run_turn(
    self,
    messages: list[dict],
    on_event: Callable[[dict], Any],
    dynamic_system_block: str | None = None,  # NEW
) -> TurnResult:
```

And in `_call_api`:

```python
system = self._cached_system
if dynamic_system_block:
    system = [{"type": "text", "text": dynamic_system_block}] + list(self._cached_system)
```

### 4. Route handler: fetch + inject per turn

In `agent/src/main.py` at the `run_turn` call site (~line 1094):

```python
sws = await build_session_state_block(conversation_id)
result = await runtime.run_turn(messages, on_event=stream_event, dynamic_system_block=sws)
```

### 5. Prompts: replace Phase 1/2/3 with declarative registry

Edit `agent/src/prompts.py` lines ~342–376:
- Remove the three-phase "Planning → Execution → Review" block from `CHAT_SYSTEM_PROMPT`
- Replace with the declarative tool registry table (see Layer 2 above)
- Add SWS usage instruction: "The Session Working State block at the top is authoritative. If an entity_id or contact_id appears there, use it directly — do not re-query."

### 6. Compactor: add ID-preservation hint

Edit `agent/src/runtime/compactor.py` — update the summarization prompt to include the ID-preservation instruction (Layer 4).

---

## What Stays the Same

- `InjectContextHook` — unchanged, still injects `conversation_id`/`session_id` into tool calls
- `research_scratchpad` tool — still available for agent-initiated session notes; SWS supplements it
- `approve_discovery` / `request_discovery_review` tools — unchanged
- All existing tools — no signature changes
- The static `CHAT_SYSTEM_PROMPT` base content (capabilities, query patterns, response format) — unchanged except removal of phase workflow block

---

## File Locations

| Component | File |
|-----------|------|
| Session state query | `agent/src/session_state.py` (new) |
| DB migration | `agent/migrations/028_session_working_state.sql` (new) |
| AgentRuntime injection | `agent/src/runtime/agent_runtime.py` |
| Route handler wiring | `agent/src/main.py` (line ~1094, `run_turn` call site) |
| Prompt rewrite | `agent/src/prompts.py` lines 241–377 |
| Compactor upgrade | `agent/src/runtime/compactor.py` |

---

## Open Questions

1. **Schema join path for contacts**: need to verify whether contacts found via `find_contacts` are written to a `contacts` table linked to `conversation_id`, or stored differently. May need to trace `save_contact` tool to confirm.
2. **SWS latency**: one extra DB query per turn. If it becomes a bottleneck, this can be parallelized with the route handler's other DB reads (e.g., fetching conversation messages).
3. **Persona format**: `agent_memory` stores the persona as a free-form string from `remember`. The SWS block should pass it verbatim so `find_contacts` can interpret it.
