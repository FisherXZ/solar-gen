# Phase 2: EPC Discovery Prototype — Implementation Plan

**Date:** 2026-03-01
**Status:** Planned
**Depends on:** Phase 1 (ISO Queue Ingestion + Dashboard)

---

## Context

The lead-gen platform has ISO queue data with ~thousands of solar projects, but `epc_company` is NULL for all of them. This prototype adds a Claude-powered research agent (Python/FastAPI backend) that uses Tavily web search to find EPC contractors, with a dedicated dashboard page to trigger research and review results.

## Architecture

```
lead-gen-agent/
├── frontend/          # Next.js dashboard (+ new EPC discovery page)
├── agent/             # NEW — Python FastAPI backend for EPC discovery
├── scrapers/          # Existing ISO queue scrapers
├── supabase/          # Migrations
└── plans/
```

- **agent/** — Python FastAPI server. Runs on port 8000. Handles Claude API + Tavily calls. Writes results to Supabase.
- **frontend/** — Next.js app. New `/epc-discovery` page calls the agent backend via fetch.

## New Dependencies

**agent/** (new Python project):
```
anthropic
tavily-python
fastapi
uvicorn
supabase
python-dotenv
```

**frontend/** (add to existing):
Nothing new — frontend just fetches from the agent API.

## Environment Variables

**agent/.env:**
```
ANTHROPIC_API_KEY=sk-ant-...
TAVILY_API_KEY=tvly-...
SUPABASE_URL=https://lkatluzymybsmtdofcogd.supabase.co
SUPABASE_SERVICE_KEY=...
```

**frontend/.env.local** (add):
```
NEXT_PUBLIC_AGENT_API_URL=http://localhost:8000
```

## File Plan

### New Files — agent/

| File | Purpose |
|------|---------|
| `agent/pyproject.toml` | Python project config + dependencies |
| `agent/.env.example` | Template for env vars |
| `agent/src/__init__.py` | Package init |
| `agent/src/main.py` | FastAPI app with endpoints |
| `agent/src/agent.py` | Claude agentic loop with tool use |
| `agent/src/prompts.py` | System prompt + user message builder |
| `agent/src/tavily_search.py` | Tavily search wrapper |
| `agent/src/db.py` | Supabase client for reading projects + writing discoveries |
| `agent/src/models.py` | Pydantic models for request/response schemas |

### New Files — frontend/

| File | Purpose |
|------|---------|
| `frontend/src/app/epc-discovery/page.tsx` | Server component for the new page |
| `frontend/src/app/epc-discovery/loading.tsx` | Loading skeleton |
| `frontend/src/components/NavBar.tsx` | Top navigation between pages |
| `frontend/src/components/epc/EpcDiscoveryDashboard.tsx` | Main client orchestrator (two-panel layout) |
| `frontend/src/components/epc/ProjectPicker.tsx` | Left panel: project list with Research buttons |
| `frontend/src/components/epc/ResearchPanel.tsx` | Right panel: results, sources, accept/reject |
| `frontend/src/components/epc/ConfidenceBadge.tsx` | Colored badge for confidence levels |
| `frontend/src/components/epc/SourceCard.tsx` | Displays one source with channel, excerpt, link |

### New Files — supabase/

| File | Purpose |
|------|---------|
| `supabase/migrations/004_create_epc_discoveries.sql` | New table + indexes + RLS |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/lib/types.ts` | Add EPC discovery types |
| `frontend/src/app/layout.tsx` | Add NavBar component |

## Build Sequence

### Step 1: Supabase Migration

- `epc_discoveries` table: `project_id` FK, `epc_contractor`, `confidence`, `sources` (JSONB), `reasoning`, `related_leads` (JSONB), `review_status`, `agent_log` (JSONB), `tokens_used`
- Partial unique index: one active (non-rejected) discovery per project
- RLS: public read, service-role write
- Reuses existing `update_updated_at()` trigger function

### Step 2: Agent Backend — Python Project Setup

- `pyproject.toml` with deps: anthropic, tavily-python, fastapi, uvicorn, supabase, python-dotenv
- Pydantic models matching the DB schema + API contracts
- Supabase client for reads and writes

### Step 3: Agent Backend — Claude Agent Core

- **tavily_search.py**: Wrapper around tavily-python with domain filtering
- **prompts.py**: System prompt encoding the 5 channels, source priority, top 10 EPCs, confidence definitions, search strategies. User message template with project details.
- **agent.py**: Agentic loop:
  1. Send project details to Claude Sonnet with two tools: `web_search` (Tavily) and `report_findings` (structured output)
  2. Loop: execute tool calls → feed results back → repeat until done or max iterations
  3. Extract `report_findings` tool call as structured result

### Step 4: Agent Backend — FastAPI Endpoints

- **POST `/api/discover`**: Takes `project_id`, fetches project, checks for existing discovery, runs agent, stores result, returns it
- **PATCH `/api/discover/{discovery_id}/review`**: Takes action (`accepted`/`rejected`). If accepted, also updates `projects.epc_company`
- **GET `/api/discoveries`**: List all discoveries (for the frontend to display)
- CORS middleware allowing frontend origin

### Step 5: Frontend — Navigation + Types

- `NavBar.tsx`: Top bar with page links, active state
- Add to `layout.tsx` above `{children}`
- Add EPC types to `types.ts`

### Step 6: Frontend — EPC Discovery Page

Two-panel layout:

```
┌──────────────────────────────────────────────────────┐
│ Stats: [X researched] [Y confirmed EPCs] [Z pending] │
├──────────────────────────────────────────────────────┤
│ Tabs: [All | Needs Research | Has EPC | Pending]      │
├────────────────────────────┬─────────────────────────┤
│ Project List (60%)         │ Research Panel (40%)     │
│ • Name, Developer, MW, ST │ • EPC name (large)       │
│ • EPC status badge         │ • Confidence badge       │
│ • [Research] button        │ • Reasoning              │
│ • Click to select          │ • Source cards           │
│                            │ • [Accept] [Reject]      │
└────────────────────────────┴─────────────────────────┘
```

Frontend calls agent backend directly (`NEXT_PUBLIC_AGENT_API_URL`).

## Running Locally

```bash
# Terminal 1 (agent)
cd agent && uvicorn src.main:app --reload --port 8000

# Terminal 2 (frontend)
cd frontend && npm run dev
```

## Verification

1. Run Supabase migration in SQL editor
2. Start agent backend, start frontend
3. Navigate to `/epc-discovery` — page loads with project list from Supabase
4. Click "Research" on a known project (e.g., Swift Current Energy)
5. Wait ~30–60s — agent searches via Tavily, finds EPC
6. Verify: EPC name, confidence, sources with URLs, reasoning all display
7. Click "Accept" — verify `projects.epc_company` gets updated
8. Check `/` dashboard — project now shows EPC
