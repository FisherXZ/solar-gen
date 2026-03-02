# Phase 2a: Batch EPC Discovery Processing

**Date:** 2026-03-02
**Status:** Planned
**Depends on:** Phase 2 (EPC Discovery Prototype)

---

## Context

The EPC discovery agent works for one project at a time. With 1,174 active projects (COD 2025–2027), clicking Research one-by-one is impractical. This adds batch processing: select multiple projects, research them concurrently with a concurrency limit of 3 (Anthropic Tier 1: 50 RPM).

## Changes

### Backend (agent/)

**Modify `agent/src/agent.py`:**
- Convert `run_agent()` to `async run_agent_async()` using `AsyncAnthropic` + `await`
- Keep sync `run_agent()` wrapper for backward compat with existing `POST /api/discover`

**New `agent/src/batch.py`:**
- `async run_batch(projects, on_progress)` — concurrent execution via `asyncio.gather()` with `Semaphore(3)`
- Calls `on_progress(BatchProgress)` after each project starts/completes
- Stores discoveries in DB as each completes

**Modify `agent/src/db.py`:**
- Extract `store_discovery(project_id, result, log, tokens)` helper from main.py (currently inlined in the `/api/discover` endpoint)

**Modify `agent/src/models.py`:**
- Add `BatchDiscoverRequest` with `project_ids: list[str]`
- Add `BatchProgress` dataclass

**Modify `agent/src/main.py`:**
- Add `POST /api/discover/batch` endpoint — accepts `{ project_ids: [...] }`, runs batch, streams progress via SSE
- Refactor `POST /api/discover` to use the shared `store_discovery` helper

### Frontend (frontend/)

**Modify `frontend/src/components/epc/EpcDiscoveryDashboard.tsx`:**
- Add checkbox selection on project rows
- Add "Research Selected (N)" button in the filter bar
- Add batch progress indicator (progress bar + streaming results)
- `handleBatchResearch(projectIds)` — calls `POST /api/discover/batch`, reads SSE stream, updates local state as results arrive

**Modify `frontend/src/components/epc/ProjectPicker.tsx`:**
- Add checkbox per row
- Add "select all visible" toggle
- Pass selected set up to parent

## File Manifest

| File | Action | Change |
|------|--------|--------|
| `agent/src/agent.py` | Modify | Async conversion + sync wrapper |
| `agent/src/batch.py` | New | Batch runner with semaphore |
| `agent/src/db.py` | Modify | Extract `store_discovery` helper |
| `agent/src/models.py` | Modify | Add BatchDiscoverRequest, BatchProgress |
| `agent/src/main.py` | Modify | Add POST /api/discover/batch, refactor discover |
| `frontend/src/components/epc/EpcDiscoveryDashboard.tsx` | Modify | Batch selection + progress UI |
| `frontend/src/components/epc/ProjectPicker.tsx` | Modify | Checkboxes + select all |

## Build Sequence

1. Convert `agent.py` to async + keep sync wrapper
2. Extract `store_discovery` into `db.py`
3. Create `batch.py` with concurrent runner
4. Add `POST /api/discover/batch` endpoint with SSE progress streaming
5. Add checkbox selection to ProjectPicker
6. Add batch Research button + progress UI to dashboard

## Verification

1. Start agent + frontend
2. Open `/epc-discovery`, check a few project checkboxes
3. Click "Research Selected (3)" — progress bar appears
4. Results stream in as each completes (~20s each, 3 at a time)
5. Single "Research" button still works for individual projects
6. Accept/Reject works on batch results
