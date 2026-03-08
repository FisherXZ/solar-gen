# Model Selector — Let Users Choose Opus vs Sonnet

## Motivation

Sonnet is fast and cheap for routine EPC discovery. Opus is better for hard-to-find EPCs where deeper reasoning helps. Users should be able to pick per-request.

## Supported Models

| Label | Model ID | Use Case |
|-------|----------|----------|
| Sonnet (default) | `claude-sonnet-4-20250514` | Standard discovery, chat |
| Opus | `claude-opus-4-20250514` | Complex research, ambiguous projects |

## Backend Changes

### 1. `agent/src/models.py`
- Add `model: str = "claude-sonnet-4-20250514"` to `DiscoverRequest`, `BatchDiscoverRequest`, `ChatRequest`

### 2. `agent/src/agent.py`
- `run_agent_async(project, knowledge_context, model)` — replace hardcoded model string with the `model` parameter
- `run_agent(project, model)` — pass through to async version

### 3. `agent/src/batch.py`
- `run_batch(projects, on_progress, concurrency, model)` — pass `model` to `_research_one`
- `_research_one(project, semaphore, on_progress, model)` — pass `model` to `run_agent_async`

### 4. `agent/src/chat_agent.py`
- `run_chat_agent(messages, conversation_id, stream_writer, model)` — use `model` param instead of `MODEL` constant
- Keep `MODEL` constant as the default fallback

### 5. `agent/src/main.py`
- `/api/discover` — pass `req.model` to `run_agent`
- `/api/discover/batch` — pass `req.model` to `run_batch`
- `/api/chat` — pass `req.model` to `run_chat_agent`

## Frontend Changes

### 6. `frontend/src/components/epc/EpcDiscoveryDashboard.tsx`
- Add model selector dropdown (Sonnet / Opus) in the research action area
- Store selection in component state
- Pass `model` field in POST body for `/api/discover`, `/api/discover/batch`

### 7. Agent chat page (`frontend/src/app/agent/page.tsx`)
- Add model selector in chat header/toolbar
- Include `model` in `/api/chat` POST body

## Data Flow

```
User picks "Opus" in UI
  → POST /api/discover/batch { project_ids: [...], model: "claude-opus-4-20250514" }
    → run_batch(projects, on_progress, concurrency=10, model="claude-opus-4-20250514")
      → _research_one(project, sem, on_progress, model)
        → run_agent_async(project, kb_context, model="claude-opus-4-20250514")
          → client.messages.create(model="claude-opus-4-20250514", ...)
```

## Validation

Backend should reject unknown model IDs. Allowlist:
```python
ALLOWED_MODELS = {
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514",
}
```

## Cost Consideration

Opus is ~5x the cost of Sonnet. The UI should display a subtle label like "Opus (5x cost)" so users make informed choices.
