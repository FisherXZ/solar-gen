"""Tests for SSE StreamWriter — Vercel AI SDK UI Message Stream Protocol."""

from __future__ import annotations

import json

from src.sse import StreamWriter


def _parse(sse_line: str) -> dict:
    """Parse a single SSE event string into a dict (skips id: lines)."""
    lines = sse_line.strip().split("\n")
    data_line = next(line for line in lines if line.startswith("data: "))
    return json.loads(data_line[6:])


class TestMessageLifecycle:
    def test_start_with_id(self):
        sw = StreamWriter()
        parsed = _parse(sw.start("msg-123"))
        assert parsed == {"type": "start", "messageId": "msg-123"}

    def test_start_without_id(self):
        sw = StreamWriter()
        parsed = _parse(sw.start())
        assert parsed == {"type": "start"}

    def test_start_step(self):
        sw = StreamWriter()
        assert _parse(sw.start_step()) == {"type": "start-step"}

    def test_finish_step(self):
        sw = StreamWriter()
        assert _parse(sw.finish_step()) == {"type": "finish-step"}

    def test_finish(self):
        sw = StreamWriter()
        assert _parse(sw.finish()) == {"type": "finish", "finishReason": "stop"}

    def test_finish_with_reason(self):
        sw = StreamWriter()
        assert _parse(sw.finish("tool-calls")) == {"type": "finish", "finishReason": "tool-calls"}

    def test_done(self):
        sw = StreamWriter()
        assert sw.done() == "data: [DONE]\n\n"


class TestTextStreaming:
    def test_text_start_with_id(self):
        sw = StreamWriter()
        parsed = _parse(sw.text_start("p-1"))
        assert parsed == {"type": "text-start", "id": "p-1"}

    def test_text_start_auto_id(self):
        sw = StreamWriter()
        p1 = _parse(sw.text_start())
        p2 = _parse(sw.text_start())
        assert p1["id"] == "0"
        assert p2["id"] == "1"

    def test_text_delta(self):
        sw = StreamWriter()
        parsed = _parse(sw.text_delta("p-1", "Hello "))
        assert parsed == {"type": "text-delta", "id": "p-1", "delta": "Hello "}

    def test_text_end(self):
        sw = StreamWriter()
        parsed = _parse(sw.text_end("p-1"))
        assert parsed == {"type": "text-end", "id": "p-1"}


class TestToolInvocations:
    def test_tool_input_start(self):
        sw = StreamWriter()
        parsed = _parse(sw.tool_input_start("tc-1", "search_projects"))
        assert parsed == {
            "type": "tool-input-start",
            "toolCallId": "tc-1",
            "toolName": "search_projects",
        }

    def test_tool_input_available(self):
        sw = StreamWriter()
        input_data = {"state": "TX", "mw_min": 100}
        parsed = _parse(sw.tool_input_available("tc-1", "search_projects", input_data))
        assert parsed == {
            "type": "tool-input-available",
            "toolCallId": "tc-1",
            "toolName": "search_projects",
            "input": {"state": "TX", "mw_min": 100},
        }

    def test_tool_output_available_dict(self):
        sw = StreamWriter()
        output = {"projects": [{"id": "p1", "name": "Test"}]}
        parsed = _parse(sw.tool_output_available("tc-1", output))
        assert parsed == {
            "type": "tool-output-available",
            "toolCallId": "tc-1",
            "output": {"projects": [{"id": "p1", "name": "Test"}]},
        }

    def test_tool_output_available_list(self):
        sw = StreamWriter()
        output = [{"id": "p1"}, {"id": "p2"}]
        parsed = _parse(sw.tool_output_available("tc-1", output))
        assert parsed["output"] == [{"id": "p1"}, {"id": "p2"}]


class TestFullStream:
    """Simulates a realistic stream sequence."""

    def test_text_then_tool_sequence(self):
        sw = StreamWriter()
        events = []

        # Message starts
        events.append(sw.start("msg-1"))
        events.append(sw.start_step())

        # Text streams in
        events.append(sw.text_start("p-0"))
        events.append(sw.text_delta("p-0", "Let me search "))
        events.append(sw.text_delta("p-0", "for Texas projects."))
        events.append(sw.text_end("p-0"))

        # Tool invocation
        events.append(sw.tool_input_start("tc-1", "search_projects"))
        events.append(sw.tool_input_available("tc-1", "search_projects", {"state": "TX"}))
        events.append(sw.tool_output_available("tc-1", [{"id": "p1", "mw_capacity": 500}]))

        # Wrap up
        events.append(sw.finish_step())
        events.append(sw.finish())
        events.append(sw.done())

        # Verify sequence
        types = []
        for e in events:
            if e.startswith("data: [DONE]"):
                types.append("DONE")
            elif "data: " in e:
                types.append(_parse(e)["type"])

        assert types == [
            "start",
            "start-step",
            "text-start",
            "text-delta",
            "text-delta",
            "text-end",
            "tool-input-start",
            "tool-input-available",
            "tool-output-available",
            "finish-step",
            "finish",
            "DONE",
        ]


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
