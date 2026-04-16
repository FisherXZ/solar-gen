"""Batch EPC discovery with concurrency control and progress streaming."""

from __future__ import annotations

import asyncio
import logging
import traceback
from collections.abc import Awaitable, Callable

from .agents.research import build_research_runtime
from .config import DEFAULT_BATCH_CONCURRENCY
from .db import get_active_discovery, sanitize_key_from_string, store_discovery
from .knowledge_base import build_knowledge_context
from .models import AgentResult, Reasoning, ResearchError
from .parsing import parse_report_findings
from .prompts import build_user_message
from .salvage import synthesize_timeout_salvage
from .triage import triage_project

logger = logging.getLogger(__name__)


def _extract_agent_result(messages: list[dict]) -> AgentResult | None:
    """Extract AgentResult from runtime messages by finding report_findings call.

    Scans messages for a tool_use block calling report_findings and parses
    its input into an AgentResult. Returns None if report_findings was never
    called.
    """
    for msg in reversed(messages):
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content", [])
        if not isinstance(content, list):
            continue
        for block in content:
            # Handle both dict blocks and Anthropic SDK objects
            if isinstance(block, dict):
                if block.get("type") == "tool_use" and block.get("name") == "report_findings":
                    return parse_report_findings(block.get("input", {}))
            elif (
                getattr(block, "type", None) == "tool_use"
                and getattr(block, "name", None) == "report_findings"
            ):
                tool_input = block.input if isinstance(block.input, dict) else {}
                return parse_report_findings(tool_input)
    return None


async def _research_one(
    project: dict,
    semaphore: asyncio.Semaphore,
    on_progress: Callable[[dict], Awaitable[None]],
    cancel_event: asyncio.Event | None = None,
    api_key: str | None = None,
) -> dict:
    """Research a single project under semaphore control."""
    project_id = project["id"]
    project_label = project.get("project_name") or project["queue_id"]

    # Check cancellation before doing any work
    if cancel_event and cancel_event.is_set():
        return {
            "project_id": project_id,
            "project_name": project_label,
            "status": "cancelled",
        }

    # Skip projects that already have an accepted discovery
    existing = get_active_discovery(project_id)
    if existing and existing["review_status"] == "accepted":
        result = {
            "project_id": project_id,
            "project_name": project_label,
            "status": "skipped",
            "reason": "already_accepted",
        }
        await on_progress(result)
        return result

    async with semaphore:
        # Check cancellation again after acquiring semaphore
        if cancel_event and cancel_event.is_set():
            return {
                "project_id": project_id,
                "project_name": project_label,
                "status": "cancelled",
            }
        await on_progress(
            {
                "project_id": project_id,
                "status": "started",
                "project_name": project_label,
            }
        )

        try:
            # Triage: classify project before research
            triage = await triage_project(project, api_key)
            if triage.action == "skip":
                agent_result = AgentResult(
                    reasoning=f"Skipped by triage: {triage.skip_reason}",
                    error=ResearchError(
                        category="triaged_skip",
                        message=f"Triage skipped: {triage.skip_reason}",
                    ),
                )
                discovery = store_discovery(
                    project_id,
                    agent_result,
                    triage.triage_log,
                    triage.tokens_used,
                    project=project,
                )
                result = {
                    "project_id": project_id,
                    "project_name": project_label,
                    "status": "completed",
                    "discovery": discovery,
                }
                await on_progress(result)
                return result

            effective_project = triage.corrected_project or project

            # Build runtime and run research
            knowledge_context = build_knowledge_context(effective_project)
            runtime, completeness_hook = build_research_runtime(
                project=effective_project, api_key=api_key
            )

            user_msg = build_user_message(effective_project, knowledge_context)
            messages = [{"role": "user", "content": user_msg}]

            turn_result = await runtime.run_turn(
                messages=messages,
                on_event=lambda e: None,
            )

            # Extract AgentResult from report_findings call in messages
            agent_result = _extract_agent_result(turn_result.messages)
            total_tokens = (
                turn_result.usage.get("input_tokens", 0)
                + turn_result.usage.get("output_tokens", 0)
            )
            agent_log = completeness_hook.agent_log

            if agent_result is None:
                # No report_findings called — synthesize salvage
                salvage = synthesize_timeout_salvage(
                    agent_log, effective_project, completeness_hook.recent_tool_outputs
                )
                agent_result = AgentResult(
                    reasoning=Reasoning(
                        summary=salvage["summary"],
                        supporting_evidence=salvage["supporting_evidence"],
                        gaps=salvage["gaps"],
                    ),
                    confidence="unknown",
                    epc_contractor=None,
                    sources=salvage["sources"],
                    negative_evidence=salvage["negative_evidence"],
                    error=ResearchError(
                        category="max_iterations_salvaged",
                        message="Hit iteration cap; salvaged structured negative evidence.",
                    ),
                )

            discovery = store_discovery(
                project_id,
                agent_result,
                agent_log,
                total_tokens,
                project=effective_project,
            )
            result = {
                "project_id": project_id,
                "project_name": project_label,
                "status": "completed",
                "discovery": discovery,
            }
        except Exception:
            result = {
                "project_id": project_id,
                "project_name": project_label,
                "status": "error",
                "error": sanitize_key_from_string(traceback.format_exc()),
            }

        await on_progress(result)
        return result


async def run_batch(
    projects: list[dict],
    on_progress: Callable[[dict], Awaitable[None]],
    concurrency: int = DEFAULT_BATCH_CONCURRENCY,
    cancel_event: asyncio.Event | None = None,
    api_key: str | None = None,
) -> list[dict]:
    """Run EPC discovery on multiple projects concurrently.

    Args:
        projects: List of project dicts from DB.
        on_progress: Async callback called for each status update.
        concurrency: Max concurrent agent runs.
        cancel_event: When set, pending tasks skip instead of starting.
        api_key: Optional user-provided Anthropic API key.

    Returns:
        List of result dicts, one per project.
    """
    semaphore = asyncio.Semaphore(concurrency)
    tasks = [
        _research_one(project, semaphore, on_progress, cancel_event, api_key=api_key)
        for project in projects
    ]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    # Normalize: convert any bare Exception objects to error dicts
    results: list[dict] = []
    for i, r in enumerate(raw_results):
        if isinstance(r, BaseException):
            project_id = projects[i]["id"] if i < len(projects) else "unknown"
            logger.error(
                "Uncaught exception in _research_one for %s: %s",
                project_id,
                r,
            )
            error_dict = {
                "project_id": project_id,
                "status": "error",
                "error": f"Uncaught exception: {type(r).__name__}: {r}",
            }
            try:
                await on_progress(error_dict)
            except Exception:
                logger.warning("Failed to send progress update for %s", project_id)
            results.append(error_dict)
        else:
            results.append(r)

    # Batch summary
    completed = sum(1 for r in results if r.get("status") == "completed")
    skipped = sum(1 for r in results if r.get("status") == "skipped")
    errors = sum(1 for r in results if r.get("status") == "error")
    logger.info(
        "Batch complete: %d projects — %d completed, %d skipped, %d errors",
        len(results),
        completed,
        skipped,
        errors,
    )

    return results
