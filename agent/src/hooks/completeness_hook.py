"""CompletenessHook — checkpoint evaluation + hard-stop tool stripping.

Ports the completeness checkpoint logic (research.py:150-168) and
hard-stop tool stripping (research.py:169-184) into the runtime hook
system so that AgentRuntime-based research gets the same guardrails.

Lifecycle:
- post_tool: tracks agent_log entries and recent_tool_outputs for
  completeness scoring; at checkpoint iterations injects guidance
  into the tool result.
- pre_tool: after hard-stop iteration, denies any tool except
  report_findings so the agent is structurally forced to conclude.
"""

from __future__ import annotations

import logging

from ..completeness import evaluate_completeness
from ..config import (
    COMPLETENESS_CHECKPOINTS as CHECKPOINTS,
)
from ..config import (
    HARD_STOP_ITERATION,
    MAX_ITERATIONS,
)
from ..runtime import Hook, HookAction, RunContext

_logger = logging.getLogger(__name__)

# Tools that don't count toward the effective iteration budget
_STATUS_ONLY_TOOLS = {"notify_progress", "research_scratchpad"}


class CompletenessHook(Hook):
    """Checkpoint evaluation and hard-stop enforcement for research runs."""

    def __init__(self) -> None:
        self._agent_log: list[dict] = []
        self._recent_tool_outputs: list[dict] = []
        self._effective_iteration: int = 0
        self._consecutive_status_only: int = 0
        self._substantive_this_turn: bool = False
        self._hard_stop_injected: bool = False
        self._checkpoint_injected_at: set[int] = set()

    def reset(self) -> None:
        """Reset state at the start of each turn."""
        self._agent_log = []
        self._recent_tool_outputs = []
        self._effective_iteration = 0
        self._consecutive_status_only = 0
        self._substantive_this_turn = False
        self._hard_stop_injected = False
        self._checkpoint_injected_at = set()

    @property
    def agent_log(self) -> list[dict]:
        """Expose agent_log for external consumers (e.g. salvage)."""
        return self._agent_log

    @property
    def recent_tool_outputs(self) -> list[dict]:
        """Expose recent_tool_outputs for external consumers."""
        return self._recent_tool_outputs

    @property
    def effective_iteration(self) -> int:
        """Current effective iteration count."""
        return self._effective_iteration

    async def pre_tool(
        self, tool_name: str, tool_input: dict, context: RunContext
    ) -> HookAction:
        # Hard-stop: deny everything except report_findings
        if self._is_hard_stop(context) and tool_name != "report_findings":
            return HookAction.deny(
                "Research budget exhausted. Only report_findings is allowed. "
                "Call report_findings immediately with your best assessment."
            )
        return HookAction.continue_with(tool_input)

    async def post_tool(
        self, tool_name: str, tool_input: dict, result: dict, context: RunContext
    ) -> dict:
        # Track in agent_log
        self._agent_log.append({"tool": tool_name, "input": tool_input})

        # Track tool outputs (skip report_findings — it's the terminal call)
        if tool_name != "report_findings":
            self._recent_tool_outputs.append(result)

        # Track effective iteration (status-only tools don't count)
        if tool_name not in _STATUS_ONLY_TOOLS:
            self._substantive_this_turn = True

        # Advance effective iteration at the end of each runtime iteration.
        # The runtime calls tools in sequence within an iteration, then moves
        # to the next API call. We use context.iteration as a proxy: when it
        # changes, we finalize the previous turn's accounting.
        #
        # However, since we only see individual tool calls, we advance the
        # counter after each substantive tool. This slightly over-counts
        # when multiple substantive tools are called in one turn, but the
        # checkpoints are coarse enough (6, 12, 18) that this is fine.
        if tool_name not in _STATUS_ONLY_TOOLS:
            self._consecutive_status_only = 0
            self._effective_iteration += 1
        else:
            self._consecutive_status_only += 1
            if self._consecutive_status_only >= 3:
                self._effective_iteration += 1
                self._consecutive_status_only = 0

        # Completeness checkpoint: evaluate and inject guidance
        eff = self._effective_iteration
        if (
            eff in CHECKPOINTS
            and eff not in self._checkpoint_injected_at
            and len(context.messages) > 1
        ):
            self._checkpoint_injected_at.add(eff)
            check = evaluate_completeness(
                eff, self._agent_log, self._recent_tool_outputs
            )
            self._agent_log.append({"completeness_check": check})
            _logger.info(
                "Completeness check at effective iteration %d (raw %d): %s (%s)",
                eff,
                context.iteration,
                check["recommendation"],
                check["level"],
            )
            if check["message"]:
                # Inject guidance into the tool result content
                if isinstance(result, dict):
                    guidance_key = "_completeness_guidance"
                    result[guidance_key] = check["message"]

        # Hard-stop message injection (once)
        if self._is_hard_stop(context) and not self._hard_stop_injected:
            self._hard_stop_injected = True
            hard_stop_msg = (
                "\n\nSYSTEM: You have exhausted your research budget. "
                "The ONLY tool available to you now is report_findings. "
                "Call it immediately with your best assessment."
            )
            if isinstance(result, dict):
                result["_hard_stop_guidance"] = hard_stop_msg

        return result

    def _is_hard_stop(self, context: RunContext) -> bool:
        """Check if we've reached the hard-stop threshold."""
        return (
            self._effective_iteration >= HARD_STOP_ITERATION
            or context.iteration >= MAX_ITERATIONS - 3
        )
