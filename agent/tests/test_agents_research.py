import sys
from unittest.mock import MagicMock

sys.modules.setdefault("supabase", MagicMock())

from src.agents.research import RESEARCH_TOOL_NAMES, build_research_runtime
from src.hooks.completeness_hook import CompletenessHook
from src.runtime import AgentRuntime


def test_build_research_runtime():
    rt, hook = build_research_runtime(project={"id": 1}, api_key="k")
    assert isinstance(rt, AgentRuntime)
    assert isinstance(hook, CompletenessHook)


def test_research_limited_tools():
    rt, _ = build_research_runtime(project={"id": 1}, api_key="k")
    names = [t["name"] for t in rt.tools]
    assert "web_search" in names and "batch_research_epc" not in names


def test_research_autonomous():
    rt, _ = build_research_runtime(project={"id": 1}, api_key="k")
    assert rt.escalation.escalation_mode == "autonomous"


def test_research_tool_names_valid():
    from src.tools import get_tool_names

    registered = get_tool_names()
    for name in RESEARCH_TOOL_NAMES:
        assert name in registered, f"'{name}' not in registry"
