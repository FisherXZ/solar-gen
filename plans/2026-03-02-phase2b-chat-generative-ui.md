# Phase 2b: Chat-Based Generative UI

**Date:** 2026-03-02
**Status:** Planned
**Depends on:** Phase 2a (Batch Processing)

---

## Context

Replace the two-panel EPC discovery dashboard with a ChatGPT-style chat interface. Users type natural language ("research the biggest Texas projects") and the AI responds with text + inline interactive React components (project cards, EPC results, Accept/Reject buttons). Uses Vercel AI SDK `useChat` with SSE streaming from the Python/FastAPI backend.

## Architecture

Two-agent design:
- **Chat agent** (NEW) — interprets user messages, calls tools, streams responses via SSE
- **EPC discovery agent** (existing) — does the actual web research per project, called as a subroutine by the chat agent

```
React (useChat)                    FastAPI (Python)
───────────────                    ─────────────────
message.parts.map(part =>          POST /api/chat (SSE stream)
  "text"           → <Markdown>      ├─ Chat agent (Claude) interprets
  "tool-search"    → <ProjectCards>  ├─ tool: search_projects → query Supabase
  "tool-research"  → <EpcResultCard> ├─ tool: research_epc → run EPC agent
  "tool-batch"     → <BatchProgress> └─ tool: batch_research_epc → run batch
)
                    ── POST /api/discover/{id}/review ──►  (button clicks)
```

## Changes

### Backend (agent/)

**New `agent/src/sse.py`** (~80 lines):
- `StreamWriter` class implementing Vercel AI SDK Data Stream Protocol
- Methods: `start()`, `text_start/delta/end()`, `tool_input_start/available()`, `tool_output_available()`, `data_event()`, `finish()`
- Formats SSE `data: {...}\n\n` lines with required `x-vercel-ai-ui-message-stream: v1` header

**New `agent/src/chat_agent.py`** (~250 lines):
- System prompt: helps users explore solar projects and research EPCs
- 4 tools: `search_projects`, `research_epc`, `batch_research_epc`, `get_discoveries`
- `async run_chat_agent(user_message, history, stream_writer)` → yields SSE events
- Uses `client.messages.stream()` for real-time text delta streaming
- Batch progress via `asyncio.Queue` bridging callbacks to SSE stream

**Modify `agent/src/db.py`:**
- Add `search_projects(state, iso_region, mw_min, mw_max, developer, needs_research, has_epc, search, limit)` — dynamic query builder for chat agent
- Add `get_discoveries_for_projects(project_ids)` — batch fetch

**Modify `agent/src/models.py`:**
- Add `ChatRequest` model: `messages: list[dict]`

**Modify `agent/src/main.py`:**
- Add `POST /api/chat` — accepts ChatRequest, returns `StreamingResponse` with SSE
- Keep existing endpoints for button-click actions

### Frontend (frontend/)

**`npm install @ai-sdk/react`**

**New `frontend/src/components/chat/ChatInterface.tsx`:**
- `useChat` with `DefaultChatTransport({ api: AGENT_API_URL + '/api/chat' })`
- Message list, input box, send button
- Empty state with suggested prompts

**New `frontend/src/components/chat/ChatMessage.tsx`:**
- Renders one message by iterating `message.parts`
- Text parts → markdown; tool parts → `ToolPart` component

**New `frontend/src/components/chat/ToolPart.tsx`:**
- Routes tool name to component: search_projects → `ProjectListCard`, research_epc → `EpcResultCard`, batch_research_epc → `BatchProgressCard`, get_discoveries → `DiscoveryListCard`
- Loading states (`input-available` → skeleton) vs results (`output-available` → component)

**New part components in `frontend/src/components/chat/parts/`:**
- `ProjectListCard.tsx` — project rows with Research buttons, "Research All" button
- `EpcResultCard.tsx` — reuses ConfidenceBadge + SourceCard, Accept/Reject buttons
- `BatchProgressCard.tsx` — progress bar during research, results list when done
- `DiscoveryListCard.tsx` — existing discoveries with status

**New `frontend/src/components/chat/SuggestedPrompts.tsx`:**
- Clickable prompt chips for empty state

**Modify `frontend/src/app/epc-discovery/page.tsx`:**
- Replace dashboard with ChatInterface (simpler server component — no pre-fetching needed)

**Retired (kept in repo, no longer imported):**
- `EpcDiscoveryDashboard.tsx`, `ProjectPicker.tsx`, `ResearchPanel.tsx`

**Reused as-is:**
- `ConfidenceBadge.tsx` (by ProjectListCard, EpcResultCard)
- `SourceCard.tsx` (by EpcResultCard)

## File Manifest

### New Files (11)
| File | Est. Lines |
|------|-----------|
| `agent/src/sse.py` | 80 |
| `agent/src/chat_agent.py` | 250 |
| `frontend/src/components/chat/ChatInterface.tsx` | 100 |
| `frontend/src/components/chat/ChatMessage.tsx` | 60 |
| `frontend/src/components/chat/ToolPart.tsx` | 50 |
| `frontend/src/components/chat/SuggestedPrompts.tsx` | 25 |
| `frontend/src/components/chat/parts/ProjectListCard.tsx` | 120 |
| `frontend/src/components/chat/parts/EpcResultCard.tsx` | 100 |
| `frontend/src/components/chat/parts/BatchProgressCard.tsx` | 80 |
| `frontend/src/components/chat/parts/DiscoveryListCard.tsx` | 80 |

### Modified Files (4)
| File | Change |
|------|--------|
| `agent/src/db.py` | Add search_projects, get_discoveries_for_projects |
| `agent/src/models.py` | Add ChatRequest |
| `agent/src/main.py` | Add POST /api/chat endpoint |
| `frontend/src/app/epc-discovery/page.tsx` | Replace dashboard with ChatInterface |

## Build Sequence

1. Create `sse.py` — SSE protocol encoder
2. Create `chat_agent.py` — chat orchestrator with tools
3. Add `search_projects` + `get_discoveries_for_projects` to `db.py`
4. Add `POST /api/chat` to `main.py`
5. `npm install @ai-sdk/react`
6. Create chat components: ChatInterface, ChatMessage, ToolPart, SuggestedPrompts
7. Create part components: ProjectListCard, EpcResultCard, BatchProgressCard, DiscoveryListCard
8. Replace /epc-discovery page with ChatInterface

## Verification

1. Start agent + frontend
2. Open `/epc-discovery` — see chat with suggested prompts
3. Type "show me the biggest Texas projects" — project cards render inline
4. Click "Research" on a card — EPC result appears in chat
5. Type "research all of these" — batch progress streams, results appear
6. Click Accept — status updates inline
7. Type "show me confirmed EPCs" — discovery list renders
