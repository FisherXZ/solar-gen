"""Tests for the Hook protocol and hook runner."""
import pytest
from agent.src.runtime.hooks import Hook, run_pre_hooks, run_post_hooks
from agent.src.runtime.types import RunContext, HookAction


class AllowAllHook(Hook):
    async def pre_tool(self, tool_name, tool_input, context):
        return HookAction.continue_with(tool_input)

    async def post_tool(self, tool_name, tool_input, result, context):
        return result


class InjectIdHook(Hook):
    async def pre_tool(self, tool_name, tool_input, context):
        if tool_name == "remember":
            tool_input["_conversation_id"] = context.conversation_id
        return HookAction.continue_with(tool_input)

    async def post_tool(self, tool_name, tool_input, result, context):
        return result


class DenyHook(Hook):
    async def pre_tool(self, tool_name, tool_input, context):
        if tool_name == "blocked_tool":
            return HookAction.deny("not allowed")
        return HookAction.continue_with(tool_input)

    async def post_tool(self, tool_name, tool_input, result, context):
        return result


class AnnotateResultHook(Hook):
    async def pre_tool(self, tool_name, tool_input, context):
        return HookAction.continue_with(tool_input)

    async def post_tool(self, tool_name, tool_input, result, context):
        result["_annotated"] = True
        return result


def _make_context(**overrides):
    defaults = dict(
        conversation_id="conv-1",
        session_id="sess-1",
        user_id="user-1",
        iteration=0,
        tool_history=[],
        messages=[],
    )
    defaults.update(overrides)
    return RunContext(**defaults)


@pytest.mark.asyncio
async def test_pre_hooks_pass_through():
    hooks = [AllowAllHook()]
    ctx = _make_context()
    action = await run_pre_hooks(hooks, "web_search", {"query": "test"}, ctx)
    assert action.kind == "continue"
    assert action.modified_input == {"query": "test"}


@pytest.mark.asyncio
async def test_pre_hooks_modify_input():
    hooks = [InjectIdHook()]
    ctx = _make_context(conversation_id="conv-42")
    action = await run_pre_hooks(hooks, "remember", {"fact": "something"}, ctx)
    assert action.kind == "continue"
    assert action.modified_input["_conversation_id"] == "conv-42"


@pytest.mark.asyncio
async def test_pre_hooks_deny_short_circuits():
    hooks = [DenyHook(), InjectIdHook()]
    ctx = _make_context()
    action = await run_pre_hooks(hooks, "blocked_tool", {}, ctx)
    assert action.kind == "deny"
    assert action.reason == "not allowed"


@pytest.mark.asyncio
async def test_pre_hooks_chain_modifications():
    """Multiple hooks modify the same input — changes accumulate."""
    hooks = [InjectIdHook(), AllowAllHook()]
    ctx = _make_context(conversation_id="conv-99")
    action = await run_pre_hooks(hooks, "remember", {"fact": "x"}, ctx)
    assert action.modified_input["_conversation_id"] == "conv-99"
    assert action.modified_input["fact"] == "x"


@pytest.mark.asyncio
async def test_post_hooks_transform_result():
    hooks = [AnnotateResultHook()]
    ctx = _make_context()
    result = await run_post_hooks(hooks, "web_search", {}, {"data": "found"}, ctx)
    assert result["_annotated"] is True
    assert result["data"] == "found"


@pytest.mark.asyncio
async def test_post_hooks_chain():
    hooks = [AnnotateResultHook(), AllowAllHook()]
    ctx = _make_context()
    result = await run_post_hooks(hooks, "web_search", {}, {"data": "x"}, ctx)
    assert result["_annotated"] is True
