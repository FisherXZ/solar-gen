"""DiscoveryHook — persist EPC discoveries when report_findings is called."""
from __future__ import annotations
from ._protocol_stub import Hook, HookAction, RunContext

class DiscoveryHook(Hook):
    async def pre_tool(self, tool_name: str, tool_input: dict, context: RunContext) -> HookAction:
        return HookAction.continue_with(tool_input)

    async def post_tool(self, tool_name: str, tool_input: dict, result: dict, context: RunContext) -> dict:
        if tool_name != "report_findings":
            return result
        from ..parsing import parse_report_findings
        from .. import db
        parsed = parse_report_findings(tool_input)
        project_id = tool_input.get("_project_id")
        if project_id:
            project = db.get_project(project_id)
            if project:
                discovery = db.store_discovery(project_id, parsed, agent_log=[], total_tokens=0, project=project)
                result["discovery_id"] = discovery.get("id") if discovery else None
                result["status"] = "recorded"
                return result
        result["status"] = "recorded"
        result["note"] = "No project_id provided — finding recorded in conversation only."
        return result
