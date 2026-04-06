# Session Persistence & Observability Design

**Date:** 2026-04-06  
**Status:** Approved  
**Scope:** `chat_agent.py`, `agent_runtime.py`, `db.py`, new SQL migration

---

## Problem

The agent conversation only exists in RAM during one HTTP request. If the server
process dies between tool rounds, the entire in-progress turn is lost. There is
also no token tracking for chat conversations — `total_tokens=0` is hardcoded
everywhere — and no structured way to ask "which tools are failing?" or "what
does a conversation cost?"

The goal: move durability from the HTTP request to the agent session, and make
every tool call, every token, and every failure observable.

---

## Approach: Append-Only Event Log (Approach A)

Modelled after claw-code-2's JSONL-per-message pattern, translated to Supabase
Postgres. Instead of appending a line to a file on disk, we INSERT a row into
`chat_events` immediately when each event happens.

The existing `chat_messages` table is unchanged from the frontend's perspective.
It still holds the final assembled assistant message at end-of-turn. The new
`chat_events` table is the durable backbone — written throughout execution,
never rewritten.

---

## Database Schema

### New table: `chat_events`

```sql
CREATE TABLE chat_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    turn_number     INT         NOT NULL DEFAULT 0,
    event_type      TEXT        NOT NULL,
    data            JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_events_conversation
    ON chat_events (conversation_id, created_at);
```

### Event types and payloads

| `event_type`     | When written                              | `data` fields                                                                 |
|------------------|-------------------------------------------|-------------------------------------------------------------------------------|
| `turn_started`   | Top of each agent loop iteration          | `turn_number`, `model`                                                        |
| `tool_called`    | Before `execute_tool()`                   | `tool_name`, `tool_call_id`, `input` (serializable)                           |
| `tool_completed` | After `execute_tool()` returns            | `tool_name`, `tool_call_id`, `duration_ms`, `is_error`                        |
| `turn_completed` | After `stream.get_final_message()`        | `turn_number`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `stop_reason` |
| `agent_finished` | Before final `save_message()` call        | `total_input_tokens`, `total_output_tokens`, `iterations`                     |
| `agent_failed`   | In exception handlers                     | `error_type`, `error_message`, `turn_number`                                  |

### Enhanced: `chat_messages` (new columns)

```sql
ALTER TABLE chat_messages
    ADD COLUMN input_tokens       INT,
    ADD COLUMN output_tokens      INT,
    ADD COLUMN cache_read_tokens  INT,
    ADD COLUMN cache_write_tokens INT,
    ADD COLUMN iterations         INT;
```

These columns summarise the full turn. `chat_events` has the per-round
breakdown; `chat_messages` has the turn total for quick queries.

---

## Code Changes

### 1. `db.py` — new `log_chat_event()` function

```python
def log_chat_event(
    conversation_id: str,
    turn_number: int,
    event_type: str,
    data: dict,
) -> None:
    """Synchronous event write (uses the existing sync Supabase client).
    Always call via asyncio.create_task(asyncio.to_thread(log_chat_event, ...))
    so it runs in a thread pool without blocking the event loop.
    Failures are logged and swallowed — never raised to the caller.
    """
    try:
        client = get_client()
        client.table("chat_events").insert({
            "conversation_id": conversation_id,
            "turn_number": turn_number,
            "event_type": event_type,
            "data": data,
        }).execute()
    except Exception:
        _logger.warning("chat_event write failed: %s %s", event_type, conversation_id)
```

Call pattern in `chat_agent.py`:

```python
asyncio.create_task(asyncio.to_thread(
    db.log_chat_event, conversation_id, turn_number, "tool_called", {...}
))
```

`save_message()` gains optional token parameters:

```python
def save_message(
    conversation_id: str,
    role: str,
    content: str,
    parts: list | None = None,
    user_id: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    cache_read_tokens: int | None = None,
    cache_write_tokens: int | None = None,
    iterations: int | None = None,
) -> dict:
```

### 2. `chat_agent.py` — six event write points

Event writes use `asyncio.create_task()` — they are fire-and-forget and never
block the SSE stream.

```
LOOP ITERATION N:
  asyncio.create_task(log_chat_event(..., "turn_started", {...}))

  → Anthropic API call (streaming)

  response = await stream.get_final_message()
  asyncio.create_task(log_chat_event(..., "turn_completed", {usage...}))

  FOR each tool_call:
    asyncio.create_task(log_chat_event(..., "tool_called", {input...}))
    t0 = time.monotonic()
    output = await execute_tool(...)
    duration_ms = int((time.monotonic() - t0) * 1000)
    asyncio.create_task(log_chat_event(..., "tool_completed", {duration_ms, is_error...}))

  IF no tool calls (agent done):
    asyncio.create_task(log_chat_event(..., "agent_finished", {totals...}))
    db.save_message(..., input_tokens=..., output_tokens=..., iterations=...)
    break

EXCEPT:
  asyncio.create_task(log_chat_event(..., "agent_failed", {error_type, message...}))
```

Token accumulation across rounds:

```python
total_usage = {
    "input_tokens": 0, "output_tokens": 0,
    "cache_read_tokens": 0, "cache_write_tokens": 0,
}
# After each get_final_message():
u = response.usage
total_usage["input_tokens"]      += getattr(u, "input_tokens", 0)
total_usage["output_tokens"]     += getattr(u, "output_tokens", 0)
total_usage["cache_read_tokens"] += getattr(u, "cache_read_input_tokens", 0)
total_usage["cache_write_tokens"]+= getattr(u, "cache_creation_input_tokens", 0)
```

### 3. `agent_runtime.py` — token accumulation

`agent_runtime.py` already has a `total_usage` dict (added in a prior
modification). The same token accumulation pattern applies. `TurnResult` already
includes `usage: dict` — these values flow back to callers via that field.
`store_discovery()` calls that currently pass `total_tokens=0` get updated to
read `turn_result.usage["input_tokens"] + turn_result.usage["output_tokens"]`.

---

## Non-Blocking Write Strategy

All `log_chat_event()` calls are wrapped in `asyncio.create_task()`. This means:

- **The SSE stream is never delayed by a DB write.** The user sees tool results
  in real time regardless of Supabase latency.
- **If an event write fails** (network blip, Supabase timeout), a `WARNING` is
  logged but the agent continues normally. The conversation is not disrupted.
- **Event ordering is best-effort.** Under load, a `tool_completed` row may
  land before its `turn_started` row. The `created_at` timestamp and
  `turn_number` are the canonical ordering fields.

---

## Recovery (V1)

On page reload after a crash, the user sees whatever was written to
`chat_messages` before the crash — the last fully committed assistant message.

The `chat_events` table reveals exactly where the crash happened: if there is
a `turn_started` with no matching `agent_finished` or `agent_failed` for a
conversation, the turn was orphaned.

**V2 (out of scope for this spec):** Surface orphaned turns as a collapsed
"Session interrupted" card in the UI with a "Resume" button.

---

## Observability Queries

Available immediately after migration runs:

```sql
-- Tool error rates
SELECT data->>'tool_name'                                                  AS tool,
       COUNT(*) FILTER (WHERE (data->>'is_error')::bool)                   AS errors,
       COUNT(*)                                                             AS total,
       ROUND(100.0 * COUNT(*) FILTER (WHERE (data->>'is_error')::bool)
             / COUNT(*), 1)                                                AS error_pct
FROM   chat_events
WHERE  event_type = 'tool_completed'
GROUP  BY 1 ORDER BY 3 DESC;

-- Tool latency (p50 / p95)
SELECT data->>'tool_name'                                                  AS tool,
       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY (data->>'duration_ms')::int) AS p50_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (data->>'duration_ms')::int) AS p95_ms
FROM   chat_events
WHERE  event_type = 'tool_completed'
GROUP  BY 1 ORDER BY 2 DESC;

-- Average tokens and turns per conversation
SELECT AVG(input_tokens + output_tokens) AS avg_tokens,
       AVG(iterations)                   AS avg_turns
FROM   chat_messages WHERE role = 'assistant';

-- Orphaned turns (potential crashes — turn_started with no finish/fail for same turn)
SELECT s.conversation_id, s.turn_number, s.created_at AS started_at
FROM   chat_events s
WHERE  s.event_type = 'turn_started'
  AND  NOT EXISTS (
       SELECT 1 FROM chat_events e
       WHERE  e.conversation_id = s.conversation_id
         AND  e.turn_number     = s.turn_number
         AND  e.event_type IN ('agent_finished', 'agent_failed')
  )
  AND  s.created_at < now() - interval '5 minutes'  -- grace period for in-flight
ORDER  BY s.created_at DESC;

-- Recent failures
SELECT conversation_id, data->>'error_type', data->>'error_message', created_at
FROM   chat_events
WHERE  event_type = 'agent_failed'
ORDER  BY created_at DESC LIMIT 20;
```

---

## Files Changed

| File | Change |
|------|--------|
| `agent/supabase/migrations/026_chat_events.sql` | New table + index + ALTER chat_messages |
| `agent/src/db.py` | Add `log_chat_event()`, update `save_message()` signature |
| `agent/src/chat_agent.py` | 6 event write points + token accumulation dict |
| `agent/src/agent_runtime.py` | Token accumulation (already has `total_usage`) + fix `store_discovery()` callers |

---

## Out of Scope

- V2 crash recovery UI ("Resume" button)
- Cost estimation in USD (can be added as a computed column once token counts
  are stable)
- Streaming `chat_events` rows to the frontend in real-time
- Retention policy / archiving old events
