# Streaming Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing cursor-replay infrastructure so SSE streams survive network drops — via `id:` fields, `Last-Event-ID` reconnect, heartbeats, memory cap, and frontend auto-retry.

**Architecture:** Three surgical layers. Layer 1 adds SSE `id:` fields so every event is addressable. Layer 2 adds heartbeats (keeps idle connections alive through proxies) and a 4MB memory cap on the event log. Layer 3 adds cursor tracking to the frontend so a dropped `useChat` stream reconnects via the existing `/api/chat-stream/{job_id}?cursor=N` endpoint.

**Tech Stack:** Python/FastAPI (backend), TypeScript/React/Vercel AI SDK (frontend). All work is in the feature branch `feature/streaming-resilience` at `.worktrees/streaming-resilience`.

**Working directory:** All commands run from `.worktrees/streaming-resilience/`

---

### Task 1: SSE Sequence Numbers

Adds `id: N\n` to every SSE event. Refactors `_event()` from module function to instance method so `StreamWriter` can own the counter.

**Files:**
- Modify: `agent/src/sse.py`
- Modify: `agent/tests/test_sse.py`

#### Background

Current `sse.py` has a module-level `_event(payload)` function. All `StreamWriter` methods call it. We need `StreamWriter` to own a sequence counter, so `_event` must become an instance method. The `_parse` test helper currently asserts `sse_line.startswith("data: ")` — this will break because the new format is `id: N\ndata: {...}\n\n`.

- [ ] **Step 1: Update the `_parse` test helper to handle `id:` lines**

Open `agent/tests/test_sse.py`. Replace `_parse`:

```python
def _parse(sse_line: str) -> dict:
    """Parse a single SSE event string into a dict (skips id: lines)."""
    lines = sse_line.strip().split("\n")
    data_line = next(l for l in lines if l.startswith("data: "))
    return json.loads(data_line[6:])
```

- [ ] **Step 2: Run existing tests — expect failures on id: assertions**

```bash
cd .worktrees/streaming-resilience
python -m pytest agent/tests/test_sse.py -v 2>&1 | tail -20
```

Expected: All 16 tests still PASS (no `id:` in output yet — we haven't changed `sse.py`). This confirms the helper update is backward-compatible.

- [ ] **Step 3: Write failing tests for sequence numbering**

Add to `agent/tests/test_sse.py`, after the existing test classes:

```python
class TestSequenceNumbers:
    def test_id_field_present(self):
        sw = StreamWriter()
        event = sw.start()
        assert "id: " in event

    def test_sequence_starts_at_zero(self):
        sw = StreamWriter()
        event = sw.start()
        assert event.startswith("id: 0\n")

    def test_sequence_increments(self):
        sw = StreamWriter()
        e0 = sw.start()
        e1 = sw.start_step()
        e2 = sw.finish()
        assert e0.startswith("id: 0\n")
        assert e1.startswith("id: 1\n")
        assert e2.startswith("id: 2\n")

    def test_each_writer_has_independent_counter(self):
        sw1 = StreamWriter()
        sw2 = StreamWriter()
        sw1.start()
        sw1.start()
        e = sw2.start()
        assert e.startswith("id: 0\n")

    def test_text_convenience_increments_three(self):
        """text() emits start+delta+end — should consume 3 sequence numbers."""
        sw = StreamWriter()
        sw.text("hello")  # uses seq 0, 1, 2
        e = sw.start_step()  # should be seq 3
        assert e.startswith("id: 3\n")
```

- [ ] **Step 4: Run new tests — expect failures**

```bash
python -m pytest agent/tests/test_sse.py::TestSequenceNumbers -v 2>&1 | tail -15
```

Expected: All 5 tests FAIL with `AssertionError` (no `id:` in output yet).

- [ ] **Step 5: Refactor `_event` to instance method and add `_seq` counter**

Replace the contents of `agent/src/sse.py` with:

```python
"""SSE encoder implementing the Vercel AI SDK UI Message Stream Protocol.

Each method returns a formatted SSE event string: `id: N\ndata: {json}\n\n`
The frontend (@ai-sdk/react useChat) parses these via EventSourceParser.
The `id:` field is the 0-based sequence number — equals the cursor position
in AgentJob.events, enabling clients to reconnect via /api/chat-stream/{job_id}?cursor=N+1.
"""

from __future__ import annotations

import json


class StreamWriter:
    """Builds SSE events for the Vercel AI SDK UI Message Stream Protocol."""

    def __init__(self) -> None:
        self._part_counter = 0
        self._seq = 0

    def _event(self, payload: dict) -> str:
        seq = self._seq
        self._seq += 1
        return f"id: {seq}\ndata: {json.dumps(payload)}\n\n"

    def _next_id(self) -> str:
        pid = str(self._part_counter)
        self._part_counter += 1
        return pid

    # -- Message lifecycle --------------------------------------------------

    def start(self, message_id: str | None = None) -> str:
        payload: dict = {"type": "start"}
        if message_id:
            payload["messageId"] = message_id
        return self._event(payload)

    def start_step(self) -> str:
        return self._event({"type": "start-step"})

    def finish_step(self) -> str:
        return self._event({"type": "finish-step"})

    def finish(self, finish_reason: str = "stop") -> str:
        return self._event({"type": "finish", "finishReason": finish_reason})

    def done(self) -> str:
        return "data: [DONE]\n\n"

    # -- Text streaming -----------------------------------------------------

    def text_start(self, part_id: str | None = None) -> str:
        return self._event({"type": "text-start", "id": part_id or self._next_id()})

    def text_delta(self, part_id: str, delta: str) -> str:
        return self._event({"type": "text-delta", "id": part_id, "delta": delta})

    def text_end(self, part_id: str) -> str:
        return self._event({"type": "text-end", "id": part_id})

    # -- Thinking (reasoning before tool calls) --------------------------------

    def thinking_start(self, part_id: str | None = None) -> str:
        return self._event({"type": "thinking-start", "id": part_id or self._next_id()})

    def thinking_delta(self, part_id: str, delta: str) -> str:
        return self._event({"type": "thinking-delta", "id": part_id, "delta": delta})

    def thinking_end(self, part_id: str) -> str:
        return self._event({"type": "thinking-end", "id": part_id})

    # -- Tool invocations ---------------------------------------------------

    def tool_input_start(self, tool_call_id: str, tool_name: str) -> str:
        return self._event(
            {
                "type": "tool-input-start",
                "toolCallId": tool_call_id,
                "toolName": tool_name,
            }
        )

    def tool_input_available(self, tool_call_id: str, tool_name: str, input_data: dict) -> str:
        return self._event(
            {
                "type": "tool-input-available",
                "toolCallId": tool_call_id,
                "toolName": tool_name,
                "input": input_data,
            }
        )

    def tool_output_available(self, tool_call_id: str, output: dict | list | str) -> str:
        return self._event(
            {
                "type": "tool-output-available",
                "toolCallId": tool_call_id,
                "output": output,
            }
        )

    # -- Convenience helpers -----------------------------------------------

    def text(self, content: str) -> str:
        """Emit a complete text block (start + delta + end) as a single string."""
        part_id = self._next_id()
        return (
            self.text_start(part_id)
            + self.text_delta(part_id, content)
            + self.text_end(part_id)
        )

    def error(self, message: str) -> str:
        """Emit an error event."""
        return self._event({"type": "error", "error": message})
```

- [ ] **Step 6: Run all SSE tests — expect all pass**

```bash
python -m pytest agent/tests/test_sse.py -v 2>&1 | tail -25
```

Expected: 21 tests PASS (16 original + 5 new sequence tests).

- [ ] **Step 7: Commit**

```bash
git add agent/src/sse.py agent/tests/test_sse.py
git commit -m "feat(sse): add sequence id: field to every SSE event"
```

---

### Task 2: Last-Event-ID Reconnection in `/api/chat`

When a browser sends `Last-Event-ID: N` on reconnect, the server reads it and replays from cursor N+1 instead of spawning a new agent.

**Files:**
- Modify: `agent/src/main.py`

#### Background

`POST /api/chat` currently checks for an existing running job via `get_active_job_for_conversation`. The `Last-Event-ID` path is a second check that fires first: if the header is present and we have a job, reconnect at the right cursor without re-running the agent. The `conversation_id` is determined from `req.conversation_id` or by creating a new conversation — that block must run before the header check so we have a conversation_id to look up.

- [ ] **Step 1: Write a test for Last-Event-ID reconnect behavior**

Create `agent/tests/test_chat_reconnect.py`:

```python
"""Tests for Last-Event-ID reconnect in /api/chat."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.agent_jobs import AgentJob


@pytest.fixture
def client():
    from src.auth import get_user_id
    app.dependency_overrides[get_user_id] = lambda: "test-user"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_last_event_id_reconnects_to_existing_job(client):
    """If Last-Event-ID header is present and a job exists, replay from cursor."""
    job = AgentJob(job_id="job-123", conversation_id="conv-abc")
    job.events = ["id: 0\ndata: {\"type\":\"start\"}\n\n",
                  "id: 1\ndata: {\"type\":\"start-step\"}\n\n",
                  "id: 2\ndata: {\"type\":\"finish-step\"}\n\n"]
    job.done = True

    with patch("src.main.get_active_job_for_conversation", return_value=job), \
         patch("src.main.db.get_conversation", return_value={"id": "conv-abc"}):
        response = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "hi"}],
                  "conversation_id": "conv-abc"},
            headers={"last-event-id": "0"},  # client saw event 0, wants 1+
        )

    assert response.status_code == 200
    body = response.content.decode()
    # Should replay from cursor=1 (events 1 and 2 only, not event 0)
    assert "start-step" in body
    assert "finish-step" in body
    # Event 0 (start) should NOT be replayed
    assert body.count('"type":"start"') == 0
```

- [ ] **Step 2: Run the test — expect failure**

```bash
python -m pytest agent/tests/test_chat_reconnect.py -v 2>&1 | tail -15
```

Expected: FAIL — `Last-Event-ID` header is currently ignored.

- [ ] **Step 3: Add Last-Event-ID handling to `/api/chat`**

In `agent/src/main.py`, find the `@app.post("/api/chat")` handler. After the `conversation_id` is established (around line 928) and before the existing job check, add:

```python
    # If client sends Last-Event-ID, reconnect to existing job at that cursor
    last_event_id = request.headers.get("last-event-id")
    if last_event_id is not None:
        try:
            cursor = int(last_event_id) + 1
        except ValueError:
            cursor = 0
        reconnect_job = get_active_job_for_conversation(conversation_id)
        if reconnect_job:
            return StreamingResponse(
                _stream_from_job(reconnect_job, cursor=cursor),
                media_type="text/event-stream",
                headers={
                    "x-vercel-ai-ui-message-stream": "v1",
                    "x-conversation-id": conversation_id,
                    "x-job-id": reconnect_job.job_id,
                },
            )
```

The existing `existing_job` check below this handles the `cursor=0` case (no header). Both can coexist without conflict.

- [ ] **Step 4: Run the test — expect pass**

```bash
python -m pytest agent/tests/test_chat_reconnect.py -v 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
python -m pytest agent/tests/test_sse.py agent/tests/test_chat_reconnect.py -v 2>&1 | tail -10
```

Expected: 22 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add agent/src/main.py agent/tests/test_chat_reconnect.py
git commit -m "feat(api): read Last-Event-ID header in /api/chat for EventSource reconnect"
```

---

### Task 3: Heartbeats and Memory Cap

Adds a 15-second ping comment to keep idle connections alive, and a 4MB cap on the event log.

**Files:**
- Modify: `agent/src/agent_jobs.py`
- Modify: `agent/src/main.py` (heartbeat in `_stream_from_job`)

#### Background

`_stream_from_job` is a module-level async generator in `main.py`, not in `agent_jobs.py`. It calls `job.wait_for_update(timeout=2.0)` — during long tool calls (web fetches, API calls), this loop spins for minutes with no output. Proxies with 30-60s idle timeouts will silently kill the connection. The fix: emit `: ping\n\n` (SSE comment) every 15 seconds. SSE comments are ignored by all parsers.

The memory cap goes in `AgentJob.append_event`. `AgentJob` is a dataclass — add `_total_bytes: int = 0` as a non-default field using `field(default=0)`. `MAX_EVENT_BYTES` is defined in `agent_jobs.py` so tests can import it directly.

- [ ] **Step 1: Write failing tests for heartbeats**

Create `agent/tests/test_agent_jobs.py`:

```python
"""Tests for AgentJob heartbeats and memory cap."""
from __future__ import annotations

import asyncio
import pytest

from src.agent_jobs import AgentJob, MAX_EVENT_BYTES


class TestHeartbeats:
    @pytest.mark.asyncio
    async def test_ping_emitted_when_idle(self):
        """A ping comment is emitted when job is idle for >0s (with tiny interval)."""
        from src.main import _stream_from_job

        job = AgentJob(job_id="j1", conversation_id="c1")
        job.done = False

        events = []
        async def collect():
            async for chunk in _stream_from_job(job, cursor=0, ping_interval=0.05):
                events.append(chunk)
                if ": ping" in chunk:
                    job.done = True  # stop after first ping

        await asyncio.wait_for(collect(), timeout=2.0)
        assert any(": ping" in e for e in events)

    @pytest.mark.asyncio
    async def test_ping_not_emitted_when_events_flowing(self):
        """No ping is emitted when events arrive quickly."""
        from src.main import _stream_from_job

        job = AgentJob(job_id="j2", conversation_id="c2")
        job.events = [f"id: {i}\ndata: {{\"type\": \"text-delta\", \"delta\": \"x\"}}\n\n"
                      for i in range(5)]
        job.done = True

        events = []
        async for chunk in _stream_from_job(job, cursor=0, ping_interval=60.0):
            events.append(chunk)

        assert not any(": ping" in e for e in events)
        assert len(events) == 5


class TestMemoryCap:
    def test_events_stored_under_cap(self):
        job = AgentJob(job_id="j3", conversation_id="c3")
        event = "id: 0\ndata: {}\n\n"  # ~18 bytes
        job.append_event(event)
        assert len(job.events) == 1

    def test_events_dropped_over_cap(self):
        job = AgentJob(job_id="j4", conversation_id="c4")
        # Fill to just over the cap
        big_event = "x" * (MAX_EVENT_BYTES + 1)
        job.append_event("id: 0\ndata: {}\n\n")  # first event fits
        job.append_event(big_event)              # this one exceeds cap
        assert len(job.events) == 1              # only the first was stored

    def test_notify_still_called_when_dropped(self):
        """Even when event is dropped from log, waiters are still notified."""
        job = AgentJob(job_id="j5", conversation_id="c5")
        # Fill to cap
        job._total_bytes = MAX_EVENT_BYTES
        notified = []
        async def waiter():
            result = await job.wait_for_update(timeout=0.5)
            notified.append(result)

        async def run():
            task = asyncio.create_task(waiter())
            await asyncio.sleep(0.01)
            job.append_event("id: 0\ndata: {}\n\n")  # dropped but still notifies
            await task

        asyncio.run(run())
        assert notified == [True]
```

- [ ] **Step 2: Run new tests — expect failures**

```bash
python -m pytest agent/tests/test_agent_jobs.py -v 2>&1 | tail -20
```

Expected: All 5 tests FAIL (no `ping_interval` param, no `_total_bytes`, no `MAX_EVENT_BYTES`).

- [ ] **Step 3: Add `_total_bytes` and memory cap to `AgentJob`**

In `agent/src/agent_jobs.py`, add the constant and update the dataclass:

```python
import logging
# (add at top with other imports)

_logger = logging.getLogger(__name__)

MAX_EVENT_BYTES = 4 * 1024 * 1024  # 4 MB — ~40k events at 100 bytes each
```

Update the `AgentJob` dataclass:

```python
@dataclass
class AgentJob:
    job_id: str
    conversation_id: str
    status: str = "running"
    events: list[str] = field(default_factory=list)
    done: bool = False
    error_message: str | None = None
    created_at: float = field(default_factory=time.time)
    _waiters: list[asyncio.Event] = field(default_factory=list)
    _task: asyncio.Task | None = None
    _total_bytes: int = field(default=0)

    def append_event(self, event: str) -> None:
        """Add an SSE event string and notify all waiting subscribers."""
        if self._total_bytes + len(event) <= MAX_EVENT_BYTES:
            self.events.append(event)
            self._total_bytes += len(event)
        else:
            _logger.warning(
                "Job %s event log full (%d bytes), dropping event from replay",
                self.job_id,
                self._total_bytes,
            )
        self._notify()
```

- [ ] **Step 4: Add `ping_interval` param and heartbeat to `_stream_from_job` in `main.py`**

In `agent/src/main.py`, find `_stream_from_job`. Add `import time` if not already present (it's a standard library import). Replace the function:

```python
async def _stream_from_job(job, cursor: int = 0, ping_interval: float = 15.0):
    """Yield SSE events from a job, starting at cursor. Safe to disconnect.

    Emits SSE comment pings every ping_interval seconds while idle to keep
    the connection alive through proxies and load balancers.
    """
    import time as _time
    last_ping = _time.monotonic()

    while True:
        # Replay any events we haven't sent yet
        while cursor < len(job.events):
            yield job.events[cursor]
            cursor += 1

        # If job is done, we've sent everything
        if job.done:
            break

        # Emit a ping comment if idle too long
        now = _time.monotonic()
        if now - last_ping >= ping_interval:
            yield ": ping\n\n"
            last_ping = now

        # Wait for more events
        await job.wait_for_update(timeout=2.0)
```

- [ ] **Step 5: Run all tests — expect pass**

```bash
python -m pytest agent/tests/test_sse.py agent/tests/test_chat_reconnect.py agent/tests/test_agent_jobs.py -v 2>&1 | tail -20
```

Expected: All 27 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add agent/src/agent_jobs.py agent/src/main.py agent/tests/test_agent_jobs.py
git commit -m "feat(agent): add SSE heartbeats and 4MB event log memory cap"
```

---

### Task 4: Frontend Cursor Tracking and Auto-Retry

Tracks how many SSE events the client has received during the live stream so `reconnectToJob` can resume from the right position after a network drop.

**Files:**
- Modify: `frontend/src/components/chat/ChatInterface.tsx`

#### Background

`ChatInterface.tsx` already has:
- `jobIdRef` — set to `x-job-id` from response headers (line 94)
- `reconnectToJob(jobId)` — calls `/api/chat-stream/${jobId}?cursor=0` (line 230)
- `reconnecting` state and `reconnectAbortRef`

What's missing:
1. `cursorRef` — tracks how many events were received from the current live stream
2. `reconnectToJob` doesn't accept a cursor
3. No auto-retry: when `useChat` status hits `"error"` with an active job, nobody calls `reconnectToJob`

The SSE events from Layer 1 now have `id: N\n` lines. The cursor to pass on retry is the last `N` seen + 1.

- [ ] **Step 1: Add `cursorRef` and update `reconnectToJob` signature**

In `frontend/src/components/chat/ChatInterface.tsx`:

After line 72 (`const jobIdRef = useRef<string | null>(null);`), add:

```typescript
  // Tracks the last SSE sequence number seen from the active stream
  const cursorRef = useRef(0);
```

Find `async function reconnectToJob(jobId: string) {` and change the signature to:

```typescript
  async function reconnectToJob(jobId: string, cursor: number = 0) {
```

In the same function, change line 230:
```typescript
        `/api/chat-stream/${jobId}?cursor=0`,
```
to:
```typescript
        `/api/chat-stream/${jobId}?cursor=${cursor}`,
```

- [ ] **Step 2: Track `id:` sequence numbers in the transport fetch**

In the transport's `fetch` override (around line 80), after `const res = await globalThis.fetch(...)`, wrap the response body to intercept `id:` lines:

```typescript
          // Wrap body to track the last SSE sequence number seen
          if (res.body) {
            const decoder = new TextDecoder();
            const transformedBody = res.body.pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                  const text = decoder.decode(chunk, { stream: true });
                  // Extract last id: line in this chunk
                  const idMatches = [...text.matchAll(/^id: (\d+)$/gm)];
                  if (idMatches.length > 0) {
                    const lastId = idMatches[idMatches.length - 1][1];
                    cursorRef.current = parseInt(lastId, 10) + 1;
                  }
                  controller.enqueue(chunk);
                },
              })
            );
            return new Response(transformedBody, {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers,
            });
          }
```

Also reset the cursor when a new message is sent. Find where `cursorRef.current` should reset — add it next to where `jobIdRef.current` is reset. Search for `jobIdRef.current = null` and add `cursorRef.current = 0` on the following line in each such location.

- [ ] **Step 3: Auto-retry on useChat error**

In `ChatInterface.tsx`, after the `useChat` call (line 102), add a `useEffect` that watches `status`:

```typescript
  // Auto-retry when useChat stream drops mid-flight
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (
      (prev === "streaming" || prev === "submitted") &&
      status === "error" &&
      jobIdRef.current &&
      cursorRef.current > 0
    ) {
      const jobId = jobIdRef.current;
      const cursor = cursorRef.current;
      reconnectToJob(jobId, cursor);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
```

- [ ] **Step 4: Build and check for TypeScript errors**

```bash
cd .worktrees/streaming-resilience/frontend
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no TypeScript errors. If there are errors about `TransformStream` types, add `/// <reference lib="dom" />` at the top of the file (it's a browser API).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/ChatInterface.tsx
git commit -m "feat(frontend): track SSE cursor and auto-retry useChat stream on network drop"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run the full backend test suite**

```bash
cd .worktrees/streaming-resilience
python -m pytest agent/tests/test_sse.py agent/tests/test_chat_reconnect.py agent/tests/test_agent_jobs.py -v 2>&1
```

Expected: All 27 tests PASS.

- [ ] **Step 2: Run the frontend build**

```bash
cd .worktrees/streaming-resilience/frontend
npm run build 2>&1 | grep -E "error|warning|✓" | head -20
```

Expected: Clean build, no errors.

- [ ] **Step 3: Smoke test the `id:` field in a real stream**

Start the backend locally and send a chat message. Inspect the raw SSE output:

```bash
# In one terminal, start the backend
cd .worktrees/streaming-resilience/agent
uvicorn src.main:app --reload --port 8000

# In another terminal, send a request and check for id: fields
curl -s -N -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role":"user","content":"hello"}]}' \
  http://localhost:8000/api/chat | head -20
```

Expected output format:
```
id: 0
data: {"type":"start","messageId":"..."}

id: 1
data: {"type":"start-step"}

id: 2
data: {"type":"thinking-start","id":"0"}
...
```

- [ ] **Step 4: Final commit if clean**

No new changes — just verify the branch is in good shape:

```bash
git log --oneline -5
```

Expected:
```
feat(frontend): track SSE cursor and auto-retry useChat stream on network drop
feat(agent): add SSE heartbeats and 4MB event log memory cap
feat(api): read Last-Event-ID header in /api/chat for EventSource reconnect
feat(sse): add sequence id: field to every SSE event
docs: add streaming resilience design spec
```
