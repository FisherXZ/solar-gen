# Agent Context Management Design
_2026-04-06_

## Problem

The chat agent loses track of what it has already discovered across conversation turns. After finding entity IDs and contact lists in turn N, it re-runs `query_knowledge_base`, `find_contacts`, and sometimes `search_projects` again in turn N+1 — even when the data is in conversation history. This causes:

- 2–4 redundant tool calls per turn (wasted latency + tokens)
- Persona/filter drift: contacts re-discovered with default criteria instead of saved persona
- User confusion: "why are you rerunning searchlinkedin contacts are here"
- After context compaction, IDs that were in messages are gone — no fallback

**Root cause:** The system prompt describes a rigid Phase 1→2→3 workflow that the agent restarts from scratch each turn. Conversation history is an unreliable cache — after compaction, IDs disappear. There is no authoritative state source the agent reads before acting.

**The fix:** Stop relying on conversation history as state. The DB is the authoritative source of truth. Query it every turn and inject the result. The cache (compaction) only needs to handle residual episodic knowledge that was never written to DB.

---

## Design Goals

1. Agent never re-queries entity IDs or contact IDs already found in the current session
2. Persona/filter criteria persist from `remember` → into subsequent `find_contacts` calls
3. State survives context compaction (DB-backed, not conversation history)
4. Confidence-gated EPC approval: `confirmed`/`likely` auto-accepts, `possible`/`unknown` asks user
5. Tool selection is declarative (condition-based) rather than imperative (phase-based)

---

## Architecture

### Layer 1: Session Working State (per-turn DB injection)

A DB-backed session state block is computed before each API call and prepended to the system prompt. The agent reads it as authoritative — it never re-discovers what is already there.

**Three-tier content model:**

| Tier | What | When injected |
|------|------|---------------|
| **Hot** (always) | Entity IDs, Contact IDs + save status, Active persona, Session filters, Pending discoveries | Every turn, ~500 tokens |
| **Warm** (if non-empty) | CRM push receipts (HubSpot company/deal IDs), Recalled memories from `agent_memory`, Project working set (project IDs the user is focused on this session) | Only when populated |
| **On-demand** (not injected) | Batch job status, enrichment detail per contact | Agent calls tool when needed |

**Sample injected block:**

```
## Session Working State
_Auto-generated from DB — authoritative. Use these IDs directly; do not re-query._

### Known Entities
- McCarthy Building Companies → entity_id: abc-123
- SOLV Energy → entity_id: def-456

### Found Contacts
- McCarthy (6 saved): Jake Ford (Civil Super) → contact_id: g1, Robert Becky (Dir PM) → contact_id: g2, ...

### Active Persona
Field Leader: Civil Superintendent, Director of PM, Survey Manager

### Session Filters
- Geography: Texas
- MW floor: 200 MW
- COD window: 2026–2027

### Pending Discoveries
- TX-1234 → McCarthy, confidence=likely, discovery_id: h7

### CRM State
- McCarthy Building Companies → pushed to HubSpot (hs_company: 1001, hs_deal: 2002)

### Recalled Memories
- McCarthy is highest priority target account
```

**Why this works:**
- Conversation history is a lossy cache. The DB is the source of truth.
- Same pattern as claw-code-2's `build_system_init_message()`: runtime-computed state injected before the agent acts.
- Our version runs per-turn from DB (not session-start from process state) because our state changes each turn.
- The static `CHAT_SYSTEM_PROMPT` remains Anthropic prompt-cached. The dynamic block (~500–800 tokens) is not cache-eligible — acceptable overhead for a 50-turn session.

**Injection point:** `AgentRuntime.run_turn()` receives an optional `dynamic_system_block: str | None`. In `_call_api`, it prepends this as a plain text block before `_cached_system`.

---

### Layer 2: Declarative Tool Registry (replace Phase 1/2/3 workflow)

The current `CHAT_SYSTEM_PROMPT` describes three phases (Planning → Execution → Review) as an imperative workflow. The agent interprets this as "always start at Phase 1" regardless of turn position.

Replace with a **declarative condition → tool table**:

```
## Tool Selection Rules

| Condition | Action |
|-----------|--------|
| User asks about projects | search_projects |
| Entity ID NOT in SWS | query_knowledge_base to get UUID |
| Entity ID IS in SWS | Use it directly — do not re-query |
| Contacts NOT in SWS for entity | find_contacts(entity_id from SWS, persona from SWS) |
| Contacts ARE in SWS | Use stored contact_ids — do not re-run find_contacts |
| Enrich a contact | enrich_contact_*(contact_id from SWS) |
| Push to HubSpot | push_to_hubspot — check CRM State in SWS first, avoid duplicate push |
| User states a persona | remember(key="persona", value=...) |
| Research EPC for a project | web_search + fetch_page + report_findings |
| Discovery confidence = confirmed or likely | approve_discovery(action="accepted") automatically |
| Discovery confidence = possible or unknown | request_discovery_review — wait for user |
| User asks to enrich all contacts | use all contact_ids from SWS — do not re-run find_contacts |
```

Replaces `prompts.py` lines ~342–376 (the three-phase Research Process block for interactive mode).

---

### Layer 3: Confidence-Gated EPC Approval

Current: every discovery goes through `request_discovery_review` (user must manually accept).

New:
- `confirmed` / `likely` → agent calls `approve_discovery(action="accepted")` immediately, no user prompt
- `possible` / `unknown` → agent calls `request_discovery_review`, waits for user

Prompt-only change. The declarative registry (Layer 2) encodes the condition. No tool or code changes needed.

---

### Layer 4: Compactor Episodic Preservation

**Key architectural decision:** IDs (Type A state) are handled entirely by Layer 1 — DB is authoritative, injected fresh every turn. The compactor does **not** need to preserve IDs. This is strictly better than trying to preserve them through summarization.

The compactor only needs to handle **Type B: episodic state** — knowledge that lived only in conversation history and was never written to DB.

**What must survive compaction:**

| Category | Examples | Why DB can't provide this |
|----------|----------|--------------------------|
| Research dead ends | "SEC EDGAR search for SunPower returned nothing"; "OSHA had no Blattner records TX 2024" | Never stored — prevents agent re-running failed searches |
| User decisions | "User rejected McCarthy for TX-1234 (wrong region)"; "User said don't contact Jake Ford" | `approve_discovery` records accept/reject, but informal mid-conversation rejections are not |
| Conversational preference overrides | "Actually skip C-suite, field leaders only"; "Focus on >500 MW for now" | Only in `agent_memory` if agent called `remember` — often not |
| In-progress workflow state | "Enriching 6 McCarthy contacts — 4 done, 2 remaining"; "Batch 7/10 complete" | Partial progress not stored |
| Agent reasoning chains | "McCarthy identified via 3 corroborating OSHA records in Riverside County" | Evidence chain for follow-up questions |
| Error states | "HubSpot push failed — API key not configured"; "enrich email for contact X returned no results" | Prevents silent re-attempts |

**Implementation:** Add three keyword-extraction passes to `_summarize_messages` in `compactor.py` (zero-dependency, no LLM call, consistent with existing heuristic design):

```python
_NO_RESULT_SIGNALS = {"no results", "not found", "nothing found", "returned 0", "no records", "could not find"}
_DECISION_SIGNALS = {"accepted", "rejected", "don't contact", "skip", "approved", "cancelled", "ignore"}
_PREFERENCE_SIGNALS = {"only want", "focus on", "skip anything", "only show", "exclude", ">", "MW floor"}
```

These produce three named sections in the `<summary>` XML block:
- `- Research dead ends:` (tool results matching `_NO_RESULT_SIGNALS`)
- `- User decisions:` (user messages matching `_DECISION_SIGNALS`)
- `- Preference overrides:` (user messages matching `_PREFERENCE_SIGNALS`)

---

## Implementation Steps

| # | What | File | Notes |
|---|------|------|-------|
| 1 | DB migration: `session_working_state` view + supporting queries | `agent/migrations/028_session_working_state.sql` | Joins entities, contacts, discoveries, agent_memory by conversation_id |
| 2 | `build_session_state_block(conversation_id)` | `agent/src/session_state.py` (new) | Returns `None` on first turn (no-op) |
| 3 | `AgentRuntime.run_turn()` + `_call_api()` changes | `agent/src/runtime/agent_runtime.py` | Add `dynamic_system_block` param, prepend to `_cached_system` |
| 4 | Wire SWS fetch into route handler | `agent/src/main.py` (~line 1094) | Fetch SWS before `run_turn`, pass as param |
| 5 | Replace Phase 1/2/3 with declarative registry | `agent/src/prompts.py` lines 342–376 | Add SWS usage instruction at top of CHAT_SYSTEM_PROMPT |
| 6 | Add episodic extraction passes to compactor | `agent/src/runtime/compactor.py` | Three new keyword sets + three new summary sections |

---

## What Stays the Same

- `InjectContextHook` — unchanged, still injects `conversation_id`/`session_id` into tool calls
- `research_scratchpad` tool — still available for agent-initiated notes; SWS supplements it
- `approve_discovery` / `request_discovery_review` tools — unchanged
- All existing tool signatures — no changes
- Static `CHAT_SYSTEM_PROMPT` content (capabilities, query patterns, response format) — unchanged except removal of phase workflow block

---

## Open Questions

1. **Schema join path for contacts**: Need to trace `save_contact` tool to confirm which table stores found contacts and how they join to `conversation_id`. The SQL in step 1 is illustrative — exact joins TBD.
2. **SWS latency**: One DB query per turn. Can be parallelized with the route handler's existing DB reads if needed.
3. **Warm tier population**: "Recalled memories" in the warm tier — inject all `agent_memory` rows for this user, or only those referenced in the current session? Recommend: only keys accessed via `recall` in this conversation_id to keep the block focused.
