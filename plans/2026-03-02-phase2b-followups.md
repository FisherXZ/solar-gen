# Phase 2b Follow-ups — TODO Items

## 1. Context Window Management (Token Cost Reduction)

**Problem:** Every chat message sends the full conversation history to Claude. Long conversations hit rate limits and waste tokens on stale tool outputs.

**Approach (from Anthropic's own recommendations):**
- **Sliding window + summary:** Keep last 6 messages verbatim, summarize older messages into a system-level context block
- **Tool result clearing:** After tool results have been consumed, replace full outputs (e.g. 20 project objects) with one-line summaries like "Returned 20 Texas solar projects"
- Combined, this caps input tokens at ~4-6k per request regardless of conversation length

**References:**
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Mem0: LLM Chat History Summarization Guide](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)

**Implementation:** Changes to `agent/src/chat_agent.py` — add a `compact_messages()` function that runs before each Claude call.

---

## 2. EPC Table Page Rebrand

**Goal:** Redesign `/epc-discovery/table` so that research results get more screen real estate. The current two-panel layout gives 60% to the project list and 40% to results — flip that ratio or use a full-width detail view.

**Requirements:**
- More space dedicated to research results per project (sources, reasoning, confidence)
- Link the table to the chat agent — "Ask agent about this project" button that opens the chat with context pre-filled
- Enable further curation of results via the agent (e.g. "Why did you rate this as 'likely'?")

---

## 3. Agent UX Improvements

### 3a. Better message + tool call formatting
- Break up long assistant messages with clear visual separation between text and tool cards
- Show tool calls in a more structured format — maybe a collapsible section or step indicator
- Avoid the current pattern where multiple tool calls blur together in one message block

### 3b. Table ↔ Agent sync after research
- Confirm that when batch/single EPC research completes via the chat agent, the table view reflects the new discoveries without a full page refresh
- May need a shared state mechanism or a simple "refetch on navigate" pattern

### 3c. Richer generative UI for research in progress
- Show what is currently being researched (project name, what search queries are being run)
- Progress indicator for multi-step research (e.g. "Searching Tavily... Analyzing results... Writing report...")
- Consider streaming partial research progress from the inner research agent up to the chat UI

---

## 4. Project Date Scope Filter

**Problem:** We're wasting tokens researching projects that are already completed or too far in the future. Projects with COD (Commercial Operation Date) from years ago are not worth investigating.

**Rule for 2026:** Only research projects with expected COD in the range **2025–2028** (one year prior through two years ahead).

**Implementation:**
- Add a date filter to `search_projects()` in `db.py` — default to `expected_cod >= 2025-01-01 AND expected_cod <= 2028-12-31`
- Add the same filter in the chat agent's system prompt so it doesn't waste tool calls on out-of-scope projects
- Update the table page's server query to match
- The existing table page query already filters `2025-2027` — expand to include 2028
- Add a note in the agent system prompt: "Only research projects with expected COD between 2025 and 2028. Skip older projects as they are likely already constructed."

---

## Priority Order

1. **Date scope filter** — quickest win, prevents token waste immediately
2. **Context window management** — prevents rate limit hits during testing
3. **Agent UX improvements** (3a, 3b, 3c) — polish
4. **EPC table rebrand** — larger design effort
