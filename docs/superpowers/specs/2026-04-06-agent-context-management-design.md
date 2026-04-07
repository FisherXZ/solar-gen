# Agent Context Management Design
_2026-04-06 — revised after external review_

## Problem

The chat agent loses track of what it has already discovered across conversation turns. After finding entity IDs and contact lists in turn N, it re-runs `query_knowledge_base`, `find_contacts`, and sometimes `search_projects` again in turn N+1 — even when the data is in conversation history. This causes:

- 2–4 redundant tool calls per turn (wasted latency + tokens)
- Persona/filter drift: contacts re-discovered with default criteria instead of saved persona
- User confusion: "why are you rerunning searchlinkedin contacts are here"
- After context compaction, IDs that were in messages are gone — no fallback

**Root cause:** Conversation history is an unreliable cache — the agent restarts Phase 1 every turn, and after compaction IDs disappear. There is no authoritative state the agent reads before acting.

**The fix:** DB is the authoritative source of truth. Query it every turn and inject the result. Episodic knowledge that was never written to DB gets durably stored at session end via a consolidation job.

---

## Architecture

### Layer 1: Session Working State (per-turn DB injection)

A DB-backed session state block is computed before each API call and prepended to the system prompt. The agent reads it as authoritative — it never re-discovers what is already there.

**Three-tier content model:**

| Tier | What | When injected |
|------|------|---------------|
| **Hot** (always) | Entity IDs, Contact IDs + save status, Rejection index, Active persona, Session filters, Pending discoveries | Every turn |
| **Warm** (if non-empty) | Research dead ends from `research_attempts`, CRM push receipts, Project working set, Recalled `agent_memory` rows | Only when populated |
| **On-demand** (not injected) | Batch job status, per-contact enrichment detail | Agent calls tool when needed |

**Token budget:** Hot tier always injected in full. Warm tier items truncated to last-N entries if the total block exceeds 800 tokens. Prioritization within warm: research dead ends > CRM state > recalled memories.

**Sample injected block:**

```
## Session Working State
_Auto-generated from DB — authoritative. Use these IDs directly; do not re-query._

### Known Entities
- McCarthy Building Companies → entity_id: abc-123
- SOLV Energy → entity_id: def-456

### Found Contacts
- McCarthy (6 saved): Jake Ford (Civil Super) → contact_id: g1, Robert Becky (Dir PM) → contact_id: g2 ...

### Rejection Index
- TX-1234 / McCarthy → rejected by user (wrong region)
- contact_id: g9 (John Smith) → do not contact

### Active Persona
Field Leader: Civil Superintendent, Director of PM, Survey Manager

### Session Filters
- Geography: Texas  |  MW floor: 200 MW  |  COD: 2026–2027

### Pending Discoveries
- TX-1234 → McCarthy, confidence=likely, discovery_id: h7

--- warm tier ---

### Research Dead Ends
- OSHA × McCarthy → no records found (2024-04-06)
- SEC EDGAR × SunPower → no relevant filings

### CRM State
- McCarthy Building Companies → pushed to HubSpot (hs_company: 1001, hs_deal: 2002)

### Recalled Memories
- McCarthy is highest priority target account
```

**Why this works:**
- The DB is the source of truth. Conversation history is a lossy cache.
- Same pattern as OpenAI Agents SDK (`RunContextWrapper` + structured state per run) and Anthropic's own "just-in-time retrieval" guidance.
- Static `CHAT_SYSTEM_PROMPT` remains Anthropic prompt-cached. Dynamic block is not cache-eligible (~500–800 tokens) — acceptable for a 50-turn session.

**Rejection index — first-class hot block, not keyword scanning:**
Formal rejections already written via `approve_discovery(action="rejected")`. For informal mid-conversation rejections ("nah that's not them", "skip this one"), the agent calls a lightweight new tool `note_rejection(entity_id_or_contact_id, reason)` when it detects rejection intent. DB write → injected in SWS on next turn. No keyword matching needed.

**Research dead ends — warm tier from `research_attempts` table, not compactor:**
`research_attempts` table (migration 006) already records source + entity + outcome. A join in the SWS view surfaces zero-result attempts: "OSHA × McCarthy → no results." This is a DB lookup, not text extraction. The compactor does not need to handle this.

---

### Layer 2: Declarative Tool Selection Rules (replace Phase 1/2/3)

The current `CHAT_SYSTEM_PROMPT` describes three phases (Planning → Execution → Review) as an imperative workflow. The agent treats every turn as "start at Phase 1."

Replace with **5 high-value declarative rules** (Anthropic guidance warns against overly brittle if-else tables; trust Claude's judgment for the rest):

```
## Tool Selection Rules

1. If entity_id IS in Session Working State → use it directly. Do NOT call query_knowledge_base.
2. If contacts ARE in Session Working State for entity → use stored contact_ids. Do NOT re-run find_contacts.
3. If entity IS in Rejection Index → do not research or contact. Acknowledge to user.
4. If EPC discovery confidence = confirmed or likely → call approve_discovery(action="accepted") automatically.
5. If EPC discovery confidence = possible or unknown → call request_discovery_review and wait.

For all other decisions, use your judgment.
```

Replaces `prompts.py` lines ~342–376. Add one instruction at the top of `CHAT_SYSTEM_PROMPT`: "The Session Working State block is authoritative for all IDs, contacts, and rejection decisions."

---

### Layer 3: Confidence-Gated EPC Approval

- `confirmed` / `likely` → agent calls `approve_discovery(action="accepted")` immediately, no user prompt
- `possible` / `unknown` → agent calls `request_discovery_review`, waits for user

Prompt-only change via rule 4/5 in Layer 2. No tool changes.

---

### Layer 4: Episodic Compactor + End-of-Session Consolidation

**What the compactor handles (inline, no API call):**
The `HeuristicCompactor` already does keyword-based extraction. Add one targeted pass for **preference overrides** only — user messages with natural language filter changes that weren't `remember`-called:

```python
_PREFERENCE_SIGNALS = {"only want", "focus on", "only show", "exclude", "skip anything", "MW floor", "only care"}
```

Produces a "Preference overrides:" section in the `<summary>` XML block. This is the one category that can't be caught by the rejection tool (since it's not a per-entity decision) and isn't in a DB table.

The compactor does NOT attempt to extract rejections or research dead ends — those are handled by DB (Layer 1).

**End-of-session consolidation job (async, runs after final turn):**
This is the OpenAI/Mem0 pattern. After the session closes, a background job:

1. Reads the current compacted `<summary>` block (if any)
2. Extracts preference override lines
3. Writes them to `agent_memory` table as `scope='project'`, `memory_key='pref_override_YYYY-MM-DD'`, `importance=7`, recency-wins on conflict (upsert by `memory_key + scope`)
4. Deduplicates against existing `agent_memory` rows for this `project_id`

**Result:** Informal preference pivots stated mid-session survive indefinitely — the next session's SWS warm tier will include them as recalled memories. No double-compaction lossy chain.

**Conflict resolution on `agent_memory`:** `updated_at` DESC wins. If the user said "field leaders only" in session A but "actually include PMs too" in session B, session B's write (later `updated_at`) overrides. The upsert on `memory_key + scope` enforces this.

---

### Idempotency Guard on `push_to_hubspot`

The SWS CRM State block instructs the agent not to re-push. But as an additional safety net, `push_to_hubspot` should check `hubspot_companies` table for an existing record with the same `entity_id` before calling the HubSpot API. Enforce at the tool level, not just via prompt instruction.

---

## Implementation Steps

| # | What | File | Notes |
|---|------|------|-------|
| 1 | DB migration: `session_working_state` view | `supabase/migrations/028_session_working_state.sql` | Joins entities, contacts, discoveries, rejections, research_attempts, agent_memory by conversation_id |
| 2 | `note_rejection` tool | `agent/src/tools/note_rejection.py` | Writes entity_id/contact_id + reason to a `session_rejections` table or `agent_memory` |
| 3 | `build_session_state_block(conversation_id)` | `agent/src/session_state.py` (new) | Returns `None` on first turn; enforces 800-token budget with warm tier truncation |
| 4 | `AgentRuntime` injection | `agent/src/runtime/agent_runtime.py` | Add `dynamic_system_block` param to `run_turn` + `_call_api` |
| 5 | Wire SWS fetch into route handler | `agent/src/main.py` (~line 1094) | Fetch SWS before `run_turn`, pass as param |
| 6 | Replace Phase 1/2/3 with 5-rule registry | `agent/src/prompts.py` lines 342–376 | Add SWS authority instruction at top of CHAT_SYSTEM_PROMPT |
| 7 | Add preference override pass to compactor | `agent/src/runtime/compactor.py` | `_PREFERENCE_SIGNALS` set + "Preference overrides:" summary section |
| 8 | End-of-session consolidation job | `agent/src/consolidation.py` (new) | Reads compacted summary → writes to `agent_memory` with recency-wins upsert |
| 9 | Wire consolidation to session close | `agent/src/main.py` | Call `consolidate_session(conversation_id)` after final turn (async, non-blocking) |
| 10 | Idempotency guard on `push_to_hubspot` | `agent/src/tools/push_to_hubspot.py` | Check `hubspot_companies` before API call |

---

## What Stays the Same

- `InjectContextHook` — unchanged
- `research_scratchpad` tool — still available for agent-initiated notes
- `approve_discovery` / `request_discovery_review` tools — unchanged
- All existing tool signatures except `push_to_hubspot` (idempotency guard added)
- Static `CHAT_SYSTEM_PROMPT` content — unchanged except removal of phase workflow block

---

## Open Questions

1. **`note_rejection` storage**: Write to a new `session_rejections` table (cleaner join for SWS view) or reuse `agent_memory` with a structured key? Recommendation: new table — typed schema is easier to query reliably.
2. **`research_attempts` join**: Confirm migration 006 records source + entity_id + null result in a queryable form. If it only stores free-text, the SWS dead-ends join may need a structured outcome column added.
3. **Warm tier size**: 800-token budget is an estimate. Measure real block sizes in staging with a typical session before hardcoding.
