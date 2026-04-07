"""Tests for active v2 streaming path bugs.

Hypothesis A: _run_agent_job_v2 emits thinking-* instead of text-* after tool rounds.
Hypothesis B: AgentRuntime._call_api never emits text_end when a text block ends.

Both tests are written to FAIL against current code, confirming the bugs.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_sse_events(events: list[str]) -> list[dict]:
    result = []
    for e in events:
        if e.strip() == "data: [DONE]":
            result.append({"type": "DONE"})
        elif e.startswith("data: "):
            result.append(json.loads(e.removeprefix("data: ").strip()))
    return result


def _event_types(events: list[str]) -> list[str]:
    return [e["type"] for e in _parse_sse_events(events)]


class MockJob:
    def __init__(self):
        self.job_id = "test-job-1"
        self.events: list[str] = []

    def append_event(self, event: str) -> None:
        self.events.append(event)


# ---------------------------------------------------------------------------
# Hypothesis A: after any tool round, the final text should use text-* events
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_A_text_after_tool_round_uses_text_events_not_thinking():
    """After a tool round (had_tool_rounds=True), the final response text
    must be streamed as text-start / text-delta / text-end — NOT as
    thinking-start / thinking-delta (which the frontend hides in the
    Reasoning accordion and never shows as the main reply).
    """
    from src.main import _run_agent_job_v2
    from src.sse import StreamWriter

    job = MockJob()

    async def mock_run_turn(messages, on_event):
        # simulate: think tool call → text response
        on_event({"type": "tool_input_start", "tool_name": "think", "tool_id": "tc-1"})
        on_event(
            {
                "type": "tool_result",
                "tool_name": "think",
                "tool_id": "tc-1",
                "input": {"thought": "let me decide"},
                "result": {"recorded": True},
            }
        )
        on_event({"type": "text_start"})
        on_event({"type": "text_delta", "text": "Here are my top 3 picks:"})
        on_event({"type": "text_end"})
        from src.runtime.types import TurnResult
        return TurnResult(messages=messages, usage={}, iterations=2)

    mock_runtime = MagicMock()
    mock_runtime.run_turn = mock_run_turn

    with (
        patch("src.main.build_chat_runtime", return_value=mock_runtime),
        patch("src.main.db"),
        patch("src.main.mark_job_done"),
    ):
        await _run_agent_job_v2(
            job,
            [{"role": "user", "content": "pick 3 projects"}],
            "conv-test",
            StreamWriter(),
        )

    types = _event_types(job.events)

    # The final text MUST appear as text-* events so the frontend renders it
    assert "text-start" in types, (
        f"Expected text-start in SSE events after tool round, got: {types}"
    )
    assert "text-delta" in types, (
        f"Expected text-delta in SSE events after tool round, got: {types}"
    )
    # Must NOT appear as thinking events (which are hidden in the Reasoning accordion)
    assert "thinking-start" not in types, (
        f"Got thinking-start instead of text-start after tool round: {types}"
    )
    assert "thinking-delta" not in types, (
        f"Got thinking-delta instead of text-delta after tool round: {types}"
    )


# ---------------------------------------------------------------------------
# Hypothesis B: _call_api must emit text_end when a text block ends
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_B_call_api_emits_text_end():
    """AgentRuntime._call_api must emit a text_end event (via on_event) when
    content_block_stop fires after a text block, so the Vercel AI SDK can
    finalize the text part.
    """
    from src.runtime.agent_runtime import AgentRuntime
    from src.runtime.compactor import Compactor
    from src.runtime.escalation import EscalationPolicy

    rt = AgentRuntime(
        system_prompt="test",
        tools=[],
        hooks=[],
        compactor=Compactor(max_tokens=100_000),
        escalation=EscalationPolicy(max_iterations=50),
        api_key="k",
    )

    # Build mock streaming events: text block start → delta → stop
    def _mk_event(etype, **kw):
        ev = MagicMock()
        ev.type = etype
        for k, v in kw.items():
            setattr(ev, k, v)
        return ev

    text_block = MagicMock()
    text_block.type = "text"

    text_delta_obj = MagicMock()
    text_delta_obj.type = "text_delta"
    text_delta_obj.text = "Hello!"

    streaming_events = [
        _mk_event("content_block_start", content_block=text_block),
        _mk_event("content_block_delta", delta=text_delta_obj),
        _mk_event("content_block_stop"),
    ]

    final_response = MagicMock()
    final_response.stop_reason = "end_turn"
    final_response.content = [MagicMock(type="text", text="Hello!")]
    final_response.usage = MagicMock(input_tokens=10, output_tokens=5)
    final_response.usage.cache_read_input_tokens = 0
    final_response.usage.cache_creation_input_tokens = 0

    class FakeStream:
        def __init__(self):
            self._events = list(streaming_events)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        def __aiter__(self):
            return self

        async def __anext__(self):
            if not self._events:
                raise StopAsyncIteration
            return self._events.pop(0)

        async def get_final_message(self):
            return final_response

    mock_client = MagicMock()
    mock_client.messages.stream.return_value = FakeStream()
    rt._client = mock_client

    emitted: list[dict] = []
    await rt._call_api(
        [{"role": "user", "content": "hi"}],
        on_event=lambda e: emitted.append(e),
    )

    types = [e["type"] for e in emitted]

    assert "text_start" in types, f"Expected text_start, got: {types}"
    assert "text_delta" in types, f"Expected text_delta, got: {types}"
    assert "text_end" in types, (
        f"text_end was never emitted — Vercel AI SDK cannot finalize the text part. "
        f"Got: {types}"
    )
