"""Tests for runtime type definitions."""
from agent.src.runtime.types import (
    TurnResult,
    RunContext,
    HookAction,
    Action,
)


def test_turn_result_creation():
    result = TurnResult(
        messages=[{"role": "assistant", "content": "hello"}],
        usage={"input_tokens": 100, "output_tokens": 50},
        events=[],
        iterations=1,
    )
    assert result.iterations == 1
    assert len(result.messages) == 1


def test_run_context_creation():
    ctx = RunContext(
        conversation_id="conv-1",
        session_id="sess-1",
        user_id="user-1",
        iteration=0,
        tool_history=[],
        messages=[],
    )
    assert ctx.conversation_id == "conv-1"
    assert ctx.tool_history == []


def test_hook_action_continue():
    action = HookAction.continue_with({"query": "test"})
    assert action.kind == "continue"
    assert action.modified_input == {"query": "test"}


def test_hook_action_deny():
    action = HookAction.deny("rate limited")
    assert action.kind == "deny"
    assert action.reason == "rate limited"


def test_hook_action_escalate():
    action = HookAction.escalate("stuck on research")
    assert action.kind == "escalate"
    assert action.message == "stuck on research"


def test_action_continue():
    a = Action.keep_going()
    assert a.kind == "continue"


def test_action_inject_guidance():
    a = Action.inject_guidance("try a different approach")
    assert a.kind == "inject_guidance"
    assert a.message == "try a different approach"


def test_action_escalate_to_user():
    a = Action.escalate_to_user(
        tried=["web_search x3", "fetch_page x2"],
        suggestion="Should I try SEC filings?",
    )
    assert a.kind == "escalate_to_user"
    assert len(a.tried) == 2


def test_action_hard_stop():
    a = Action.hard_stop("max iterations")
    assert a.kind == "hard_stop"
    assert a.reason == "max iterations"
