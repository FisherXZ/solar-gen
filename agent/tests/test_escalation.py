"""Tests for the EscalationPolicy."""
import json
import pytest
from agent.src.runtime.escalation import EscalationPolicy


def _tool_result_msg(tool_name: str, content: str) -> dict:
    """Build a user message containing a tool result."""
    return {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": f"id-{tool_name}",
                "content": content,
            }
        ],
    }


def _assistant_msg(tool_name: str) -> dict:
    """Build an assistant message with a tool_use block."""
    return {
        "role": "assistant",
        "content": [
            {"type": "tool_use", "id": f"id-{tool_name}", "name": tool_name, "input": {}},
        ],
    }


def test_continue_when_under_limits():
    policy = EscalationPolicy(max_iterations=50, stagnation_window=4)
    messages = [
        _assistant_msg("web_search"),
        _tool_result_msg("web_search", json.dumps({"results": [{"title": "SunPower EPC project"}]})),
    ]
    action = policy.evaluate(messages, iteration=2, tool_history=["web_search", "web_search"])
    assert action.kind == "continue"


def test_hard_stop_at_max_iterations():
    policy = EscalationPolicy(max_iterations=10)
    action = policy.evaluate([], iteration=10, tool_history=[])
    assert action.kind == "hard_stop"


def test_stagnation_detection_user_mode():
    """When recent tools return no new signals, escalate to user."""
    policy = EscalationPolicy(max_iterations=50, stagnation_window=4, escalation_mode="user")

    # Simulate 4 tool results with no EPC-related content
    messages = []
    for i in range(4):
        messages.append(_assistant_msg("web_search"))
        messages.append(_tool_result_msg("web_search", json.dumps({"results": []})))

    action = policy.evaluate(messages, iteration=8, tool_history=["web_search"] * 8)
    assert action.kind == "escalate_to_user"


def test_stagnation_detection_autonomous_mode():
    """In autonomous mode, inject guidance instead of escalating."""
    policy = EscalationPolicy(max_iterations=50, stagnation_window=4, escalation_mode="autonomous")

    messages = []
    for i in range(4):
        messages.append(_assistant_msg("web_search"))
        messages.append(_tool_result_msg("web_search", json.dumps({"results": []})))

    action = policy.evaluate(messages, iteration=8, tool_history=["web_search"] * 8)
    assert action.kind == "inject_guidance"


def test_no_stagnation_with_new_signals():
    """When results contain new entity mentions, don't flag stagnation."""
    policy = EscalationPolicy(max_iterations=50, stagnation_window=4)

    messages = []
    companies = ["SunPower Corp", "NextEra Energy", "Blattner Energy", "Mortenson Construction"]
    for company in companies:
        messages.append(_assistant_msg("web_search"))
        messages.append(_tool_result_msg(
            "web_search",
            json.dumps({"results": [{"title": f"{company} wins EPC contract"}]}),
        ))

    action = policy.evaluate(messages, iteration=8, tool_history=["web_search"] * 4)
    assert action.kind == "continue"


def test_consecutive_errors_escalate():
    """3+ consecutive tool errors should trigger escalation."""
    policy = EscalationPolicy(max_iterations=50, stagnation_window=4, escalation_mode="user")

    messages = []
    for i in range(3):
        messages.append(_assistant_msg("web_search"))
        messages.append(_tool_result_msg(
            "web_search",
            json.dumps({"error": "Search service returned 500"}),
        ))

    action = policy.evaluate(messages, iteration=5, tool_history=["web_search"] * 3)
    assert action.kind == "escalate_to_user"


def test_min_iterations_before_stagnation():
    """Don't flag stagnation in the first few iterations."""
    policy = EscalationPolicy(max_iterations=50, stagnation_window=4, min_iterations_before_stagnation=6)

    messages = []
    for i in range(4):
        messages.append(_assistant_msg("web_search"))
        messages.append(_tool_result_msg("web_search", json.dumps({"results": []})))

    action = policy.evaluate(messages, iteration=3, tool_history=["web_search"] * 3)
    assert action.kind == "continue"  # too early to flag
