# Agent v2 — EPC Discovery Improvements

**Date:** 2026-03-08
**Status:** Planning
**Scope:** Seven upgrades to the EPC discovery agent: model upgrade, deeper search, verification mindset, new tools, smarter prompts, better knowledge graph leverage, and human-in-the-loop research flow.

---

## Context

The current agent (v1) has a single research tool (`web_search` via Tavily) and runs in a fire-and-forget loop: search → report → done. Key limitations:

- Agent sees only Tavily snippets (~200 chars), can't read full articles
- No planning step — jumps straight into searching
- Knowledge graph is underutilized (no loyalty stats, no negative knowledge)
- No way to pause research and ask the user for direction
- Batch and single-project research share the same one-shot flow
- Model (Sonnet) lacks the reasoning depth needed for nuanced EPC vs developer vs utility distinctions
- Agent has a "discovery mindset" — optimized to report *something* rather than verify it's correct
- Search depth is shallow (3-5 searches) compared to what's needed (14-40+ tool calls for hard cases)
- Tavily alone misses contractor portfolio pages, subcontractor blogs, and regulatory PDFs

---

## Change 1: Model Upgrade — Sonnet → Opus 4.6

### Problem
The agent uses `claude-sonnet-4-20250514`. Sonnet is fast and cheap but weaker at the nuanced reasoning this task demands — distinguishing "Ameren Illinois is the transmission owner" from "Ameren Illinois is the developer," or recognizing that a 1.3MW residential installer is not a credible EPC for a 300MW utility-scale project.

### Solution
Upgrade to `claude-opus-4-6` for the research agent.

### Cost Tradeoff
Opus is ~5x the cost of Sonnet per token. But a single false positive that gets accepted and sent to a sales rep is worse than the extra dollar per research run. The quality/cost tradeoff favors Opus here because:
- Each research run is a one-shot judgment call, not a high-volume chatbot
- False positives waste human reviewer time and erode trust in the system
- Batch runs can optionally stay on Sonnet for budget control, with Opus reserved for single-project deep research

### Implementation Options
- **Option A (simple):** Change the model string everywhere — `claude-opus-4-6`
- **Option B (tiered):** Add a `model` parameter to `run_agent_async()`. Chat-triggered research uses Opus, batch uses Sonnet by default with an Opus override flag. Expose model choice in the frontend.

**Recommendation:** Start with Option A. Optimize cost later once we see per-run token usage on Opus.

### Files to Change
- `agent/src/agent.py` line 125 — change model string
- Optionally: add model parameter to `run_agent_async()` and `run_batch()`

---

## Change 2: Deeper Search — Raise Iteration Cap + Verification Loop

### Problem
The agent does 3-5 Tavily searches then reports. Effective verification agents do 14-41 tool calls — they follow leads, cross-reference contractor websites, check subcontractor pages, read regulatory filings. The current `MAX_ITERATIONS = 10` cap plus the prompt instruction to report after "3-5 searches" encourages premature reporting.

### Solution
Two changes:

### 2a. Raise Iteration Cap
Increase `MAX_ITERATIONS` from 10 to 25. The agent won't always use 25 — the prompt and `report_findings` tool naturally end the loop — but it removes the artificial ceiling for hard cases.

### 2b. Verification Step Before Reporting
Add a prompt instruction that forces the agent to verify before committing:

> **Before calling report_findings with confidence "likely" or "possible":**
> 1. Search for the candidate EPC's portfolio/website to confirm they work at this project's scale
> 2. If the EPC candidate has only been seen on projects 10x smaller or larger, downgrade to "possible" or "unknown"
> 3. Search for counter-evidence: are there other EPCs mentioned for this specific project?
>
> **Scale check:** A company that does 1-5MW residential/commercial installs is NOT a credible EPC for a 200MW+ utility-scale project. Verify the candidate operates at the right scale.

This catches the false positives like reporting a 1.3MW installer as "likely" EPC for a 300MW project.

### Files to Change
- `agent/src/agent.py` line 15 — change `MAX_ITERATIONS = 25`
- `agent/src/prompts.py` — add verification instructions to system prompt

---

## Change 3: Verification Mindset — Prompt Overhaul

### Problem
The current prompt says "find the EPC" — this creates a discovery bias. The agent is incentivized to report *something* rather than admit "unknown." When it finds a weak signal, it reports "likely" instead of recognizing the evidence is insufficient.

### Solution
Shift the prompt from "find the EPC" to "find and verify the EPC." Key prompt changes:

### 3a. Reframe the Goal
Change the opening from:
> "Your job is to find the EPC contractor"

To:
> "Your job is to identify and verify the EPC contractor. Reporting 'unknown' after a thorough search is a better outcome than reporting an unverified guess. False positives waste human reviewer time."

### 3b. Add Counter-Evidence Seeking
Add to the instructions:
> When you find a candidate EPC, actively look for reasons it might be wrong:
> - Is this company actually the developer, utility, or landowner — not the EPC?
> - Does this company operate at the right scale (utility-scale solar, 50MW+)?
> - Is the source actually about this specific project, or a different project with a similar name?
> - Could this be a subcontractor or equipment supplier rather than the general EPC?

### 3c. Tighten Confidence Definitions
Current "likely" = "1 reliable source." This is too loose. Tighten to:
> - **likely**: 1 reliable source that specifically names the EPC for this project (not just the developer's other projects), AND the EPC is confirmed to operate at this project's scale

### 3d. Add "Insufficient Evidence" Guidance
> If after 8+ searches you only have indirect evidence (e.g., the EPC worked with this developer on a different project in a different state), report "possible" not "likely." If you have no project-specific evidence at all, report "unknown" — do not guess.

### Files to Change
- `agent/src/prompts.py` — rewrite core sections of `SYSTEM_PROMPT`

---

## Change 4: `fetch_page` Tool — Full Page Scraping

### Problem
The agent finds promising URLs via Tavily but can only read 1-2 sentence snippets. A press release naming the EPC might be in the search results, but the snippet cuts off before the relevant paragraph.

### Solution
Add a `fetch_page(url)` tool that downloads a web page and extracts clean article text.

### Implementation
- Use `httpx` (async HTTP client) to download the page HTML
- Use `trafilatura` to strip navigation, ads, scripts and extract article text
- Truncate to ~4000 characters (enough for a full press release, keeps context budget manageable)
- Return extracted text + page title + URL back to the agent

### Why not a headless browser?
- **Speed:** `httpx` = 200-500ms per page vs 3-10s for headless Chrome
- **Resources:** No Chrome instances eating RAM during concurrent batch runs
- **Unnecessary:** Target pages are press releases, trade articles, portfolio pages — content is in the HTML, not behind JavaScript rendering
- **Escape hatch:** If specific EPC portfolio sites need JS rendering, we can add domain-specific headless scraping later

### Tool Definition
```python
{
    "name": "fetch_page",
    "description": "Fetch and read the full text of a web page. Use this when a search result snippet looks promising but you need to read the full article to confirm EPC details. Returns cleaned article text (truncated to ~4000 chars).",
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The URL to fetch and read."
            }
        },
        "required": ["url"]
    }
}
```

### Guard Rails
- Timeout: 10 second max per fetch
- Block non-HTTP(S) URLs
- Block obviously large files (PDFs, images, videos) by checking Content-Type header before downloading body
- Rate limit: max 5 fetches per research run to prevent the agent from crawling endlessly

### Files to Change
- `agent/src/agent.py` — add tool definition, handle `fetch_page` in the tool loop
- New file: `agent/src/page_fetcher.py` — fetch + extract logic
- `requirements.txt` — add `trafilatura`, `httpx` (httpx may already be present)

---

## Change 5: Planning Phase + Smarter Prompts

### Problem
The agent jumps straight into searching without considering what it already knows. It also repeats searches that prior research already tried (and failed with).

### Solution
Three prompt-level improvements (no new tools needed):

### 2a. Planning Instruction
Add to the system prompt:

> Before your first search, analyze the project details and knowledge context. Consider:
> 1. What do I already know about this developer's EPC relationships?
> 2. What searches have already been tried (and failed) on this project?
> 3. What is my best first search based on available information?
>
> State your plan briefly, then execute.

This gives us visibility into agent reasoning (it'll appear in the agent log) and reduces wasted searches.

### 2b. Negative Knowledge Instruction
Add to the system prompt:

> If prior research attempts are listed in the knowledge context, DO NOT repeat the same searches. Try different angles: different keywords, different source sites, different project name variations.

### 5c. EPC Portfolio Site Searches
Add to the search strategy section:

> 7. Check known EPC portfolio sites directly: search for "[project name]" or "[developer]" on sites like mccarthybuilding.com, mortenson.com, signalenergy.com, blattnerenergy.com, etc.

This doesn't require a new tool — the agent can do `web_search("site:mortenson.com [developer] solar")` with existing Tavily.

### 5d. Supplement Tavily with a Broader Web Search
Tavily is optimized for quick factual answers but misses contractor portfolio pages, subcontractor blogs, and regulatory PDFs. Options:

- **Brave Search API** — broader index than Tavily, good at surfacing niche pages (subcontractor blogs, small EPC portfolio pages). Has a generous free tier.
- **Google Custom Search API** — widest index, best at surfacing regulatory PDFs and obscure filings. 100 free queries/day, $5/1000 after.
- **Serper.dev** — Google results via API, cheaper than Google CSE directly.

**Recommendation:** Add Brave Search as a second `web_search_broad` tool. The agent uses Tavily for the initial targeted searches, then `web_search_broad` when Tavily comes up empty or when searching for niche sources (subcontractor pages, regulatory filings). This way we don't replace Tavily (it's good at what it does) but we cover its blind spots.

### Files to Change
- `agent/src/prompts.py` — update `SYSTEM_PROMPT`
- `agent/src/agent.py` — add `web_search_broad` tool definition and handler
- New file: `agent/src/brave_search.py` — Brave Search API client
- `.env` — add `BRAVE_SEARCH_API_KEY`

---

## Change 6: Better Knowledge Graph Leverage

### Problem
The knowledge context sent to the agent before research is underutilized. It shows raw engagement lists but doesn't surface actionable patterns.

### Solution
Enhance `build_knowledge_context()` with three improvements:

### 3a. Developer Loyalty Stats
Calculate and surface EPC usage patterns per developer.

Current output:
```
Known EPC relationships:
- Blattner: confirmed for Project A (200MW, TX)
- Blattner: likely for Project B (150MW, TX)
- McCarthy: confirmed for Project C (300MW, IL)
```

Improved output:
```
Known EPC relationships (3 engagements across 2 EPCs):
- Blattner: 2 of 3 projects (67%) — TX focused
- McCarthy: 1 of 3 projects (33%) — IL

Strongest signal: This developer has a repeated relationship with Blattner in TX.
```

This helps the agent weigh its findings. If it finds a weak signal pointing to Blattner for a new TX project by the same developer, the loyalty pattern upgrades that to "likely."

### 3b. Negative Knowledge — Failed Searches
Surface which searches have already been tried so the agent doesn't repeat them.

Current output:
```
### Prior Research on This Project
- 2026-03-05: not_found. Tried: "Acme Solar TX EPC", "Acme Solar construction"
```

Improved output:
```
### Prior Research on This Project
- 2026-03-05: not_found after 5 searches.
  Searches already tried (do NOT repeat):
  - "Acme Solar TX EPC"
  - "Acme Solar construction"
  - "Acme Solar financial close"
  Try different angles: developer website, EPC portfolio pages, regulatory filings, different project name variations.
```

### 3c. Enriched State EPC Stats
Add project count, total MW, and recency to the state-level EPC list.

Current output:
```
### EPCs Active in TX
- Blattner: confirmed for Project A (200MW)
```

Improved output:
```
### EPCs Active in TX (from 15 known engagements)
- Blattner: 6 projects, 1.2GW total, most recent 2026-02 (confirmed)
- McCarthy: 4 projects, 800MW total, most recent 2025-11 (confirmed)
- Signal Energy: 2 projects, 350MW total, most recent 2025-09 (likely)
```

### Files to Change
- `agent/src/knowledge_base.py` — update `build_knowledge_context()`, `get_developer_engagements()`, `get_epcs_in_state()`

---

## Change 7: Human-in-the-Loop — `request_guidance` Tool (Chat Only)

### Problem
Some projects are ambiguous. The agent might find two possible EPCs, or find a lead that needs human judgment ("this press release mentions a JV — should I count the JV partner as the EPC?"). Currently it has to guess and commit.

### Solution
Add a `request_guidance` tool that pauses research and asks the user a question. **Chat-only** — batch research stays fire-and-forget (you don't want 50 projects each pausing for human input).

### Tool Definition
```python
{
    "name": "request_guidance",
    "description": "Pause research and ask the user for clarification. Use when you find ambiguous evidence, multiple possible EPCs, or need the user to confirm a finding before continuing. Only available in interactive (chat) research, not batch mode.",
    "input_schema": {
        "type": "object",
        "properties": {
            "status_summary": {
                "type": "string",
                "description": "Brief summary of what you've found so far."
            },
            "question": {
                "type": "string",
                "description": "The specific question you need answered."
            },
            "options": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional list of choices for the user."
            }
        },
        "required": ["status_summary", "question"]
    }
}
```

### Flow
1. User triggers single-project research via chat: "Research the EPC for project X"
2. Agent searches, finds ambiguous results
3. Agent calls `request_guidance` with its question
4. **Agent loop pauses** — conversation state (full `messages` array) is saved
5. Frontend renders the question as a chat message with optional buttons for `options`
6. User responds in chat
7. Chat agent resumes the research agent with the user's answer injected as the tool result
8. Agent continues searching or reports findings

### Implementation Details
- The `request_guidance` tool is only included in the tools array when research is triggered via chat (not batch/direct API)
- When the tool is called, `run_agent_async` returns a special `AgentPaused` result containing the messages array + the question
- The chat agent (`chat_agent.py`) handles this by streaming the question to the user and waiting for the next message
- On the next user message, the chat agent resumes the research agent by reconstructing the messages array and continuing the loop
- Need a new model: `AgentPaused` (alongside `AgentResult`) to represent the paused state

### Frontend Changes
- `EpcResultCard.tsx` or a new `GuidanceCard.tsx` to render the question + options
- Options rendered as clickable buttons that auto-fill the chat input
- Regular text input also available for free-form responses

### Files to Change
- `agent/src/agent.py` — add tool definition (conditionally), handle pause/resume
- `agent/src/models.py` — add `AgentPaused` model
- `agent/src/chat_agent.py` — handle paused agent state, resume on next user message
- New file: `frontend/src/components/chat/parts/GuidanceCard.tsx` — render question UI

---

## Implementation Order

| Phase | Changes | Effort | Dependencies |
|-------|---------|--------|--------------|
| **A** | 1 (Model → Opus) + 2 (deeper search) + 3 (verification mindset) | Small | None — all prompt/config changes |
| **B** | 5 (planning phase prompts) + 6 (KB enhancements) | Small | None — can parallel with A |
| **C** | 4 (`fetch_page` tool) | Medium | A should land first (Opus makes better use of full page text) |
| **D** | 5d (`web_search_broad` via Brave) | Medium | None, but benefits from C (agent can fetch_page Brave results too) |
| **E** | 7 (`request_guidance` chat-only) | Large | All other changes should land first |

**Phase A is the highest-leverage, lowest-effort change.** Upgrading the model + raising the iteration cap + adding verification prompts directly addresses the root cause of false positives. Everything else builds on a smarter, more thorough base agent.

---

## Success Metrics

- **Hit rate improvement**: Track % of research runs that find an EPC (confirmed + likely) before and after each change
- **Search efficiency**: Average number of Tavily searches per run should decrease (planning + negative knowledge = fewer wasted searches)
- **Page fetch value**: % of `fetch_page` calls that upgrade confidence (snippet was "possible" → full article confirms "likely")
- **Guidance usage**: In chat mode, how often does the agent ask for guidance, and does user input improve outcomes vs fire-and-forget?
