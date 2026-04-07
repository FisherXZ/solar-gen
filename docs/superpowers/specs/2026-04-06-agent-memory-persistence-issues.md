# Agent Memory Persistence Issues
_Logged: 2026-04-06_

## Observed in Chat Session

User was running a contact discovery workflow: find top projects → research EPCs → find contacts → enrich → push to HubSpot. Across every turn after the initial discovery, the agent re-ran the full context-gathering cycle instead of using already-found data.

---

## Issue 1: Entity ID re-lookup every turn (HIGH SEVERITY)

**What happens:** `query_knowledge_base("McCarthy Building Companies")` and `query_knowledge_base("SOLV Energy")` run before every downstream action — enrichment, HubSpot push, even contact re-search — even though these entity IDs are already present in the conversation's tool results from earlier in the same turn sequence.

**Root cause:** `find_contacts` requires `entity_id` (UUID). The agent has no instruction to scan prior tool results for this UUID before re-querying. Default behavior: re-establish context from scratch each turn.

**Code location:** `agent/src/tools/find_contacts.py` (requires entity_id), `agent/src/prompts.py:241-377` (no "use existing IDs" instruction)

---

## Issue 2: `find_contacts` re-runs instead of using saved contacts (HIGH SEVERITY)

**What happens:** After contacts are found (Jake Ford, Robert Becky, etc.) and `save_contact` is called for each, the next turn that involves those contacts re-runs `find_contacts` rather than reading the saved contact IDs from the database or conversation context.

**User frustration quote:** "why are you rerunning searchlinkedin contacts are here"

**Root cause:** Agent has no instruction to check "have I already found contacts for this entity in this conversation?" The `find_contacts` tool has a 30-day DB cache but the agent re-invokes it anyway because the system prompt's workflow is "gather entity ID → find contacts → act" regardless of turn position.

**Code location:** `agent/src/tools/find_contacts.py:63-73` (cache check exists but agent bypasses it by re-calling), `agent/src/prompts.py`

---

## Issue 3: `search_projects` fires spuriously on non-project turns (MEDIUM SEVERITY)

**What happens:** "No projects found matching your criteria" appears 2-3× on turns where the user is asking about enrichment or HubSpot push. The agent runs a project search as a reflex even when the current intent has nothing to do with finding new projects.

**Observed on:** "enrich with email and phone" turn (2× no projects), "push to hubspot" turn (3× no projects)

**Root cause:** The system prompt's tool selection logic doesn't have an explicit guard: "if current intent is enrichment/push, do NOT search for projects."

**Code location:** `agent/src/prompts.py` tool selection section

---

## Issue 4: Persona change doesn't propagate to subsequent contact searches (HIGH SEVERITY)

**What happens:** User defined a "Field Leader" buyer persona (Civil Superintendent, Director of PM, Survey Manager) and agent correctly `Saved to memory × 2`. But on subsequent turns (enrich, push), the agent re-ran `find_contacts` with default parameters, returning C-suite contacts again, not the Field Leader persona.

**Root cause:** The persona is saved to `agent_memory` table via `remember`, but `find_contacts` doesn't consult agent memory for persona filters. It runs the contact discovery agent with hardcoded/default persona criteria.

**Code location:** `agent/src/tools/find_contacts.py` (contact discovery agent prompt doesn't inject recalled memories), `agent/src/prompts.py`

---

## Issue 5: Duplicate conversations in sidebar (MEDIUM SEVERITY / UX signal)

**What happens:** "I want to deep-dive a company maccarthy" appears twice, "Let's triage the 61 pending reviews" appears twice in the conversation sidebar. Users are hitting broken state and starting fresh rather than continuing.

**Root cause:** Downstream symptom of issues 1-4. When the agent loses track of what it found, users restart rather than debug.

---

## Issue 6: `enrich_contact_*` tools re-discover contacts instead of using IDs (HIGH SEVERITY)

**What happens:** When user says "enrich all 6 with email and phone", the agent re-queries entity IDs and re-runs `find_contacts` before calling `enrich_contact_email`. The contact IDs from the previous turn are not used.

**Root cause:** The enrichment tools require `contact_id`. The agent doesn't maintain a "contacts found this session" working list. Each turn restarts the ID-resolution chain.

---

## Architectural Root Cause Summary

The system prompt defines a **linear workflow** (gather context → act) but the user interaction is **multi-turn and pipelined** (find things → then do step 2 → then step 3). There is no mechanism to:
1. Signal "I have already found entity IDs for X — skip re-lookup"
2. Signal "I have already found contacts for X — skip find_contacts"
3. Pass persona/filter state into tool invocations

The `research_scratchpad` tool exists for exactly this purpose (persist session state across context compaction) but the system prompt does not instruct the agent to write entity/contact IDs to it after discovery.

---

## Proposed Fix Directions (to be designed)

1. **Prompt fix:** Add "if entity_id or contact_ids are already in conversation context, use them — do not re-query"
2. **Session state tool:** Agent explicitly writes entity_id + contact_ids to `research_scratchpad` after each discovery step; reads at start of subsequent turns
3. **Tool redesign:** `enrich_contact_*` and `push_to_hubspot` accept `contact_name + company_name` as fallback (no UUID required)
4. **Persona injection:** `find_contacts` reads recalled memories before building search parameters

_See design session: 2026-04-06 brainstorming_
