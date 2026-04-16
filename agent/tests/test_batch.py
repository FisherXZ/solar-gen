"""Tests for batch.py — concurrent EPC discovery processing."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from src.batch import _extract_agent_result, _research_one, run_batch
from src.models import TriageResult
from tests.conftest import make_agent_result

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fake_discovery(project_id):
    return {
        "id": f"disc-{project_id}",
        "project_id": project_id,
        "epc_contractor": "McCarthy Building",
        "confidence": "likely",
        "review_status": "pending",
    }


def _make_mock_runtime_and_hook():
    """Create a mock runtime + completeness_hook that simulates a successful run."""
    mock_hook = MagicMock()
    mock_hook.agent_log = [{"iteration": 0}]
    mock_hook.recent_tool_outputs = []

    mock_turn_result = MagicMock()
    mock_turn_result.messages = [
        {
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "name": "report_findings",
                    "id": "tool-1",
                    "input": {
                        "epc_contractor": "McCarthy Building",
                        "confidence": "likely",
                        "reasoning": "Found in trade publication.",
                        "sources": [
                            {
                                "channel": "trade_publication",
                                "publication": "Solar Power World",
                                "excerpt": "McCarthy awarded contract",
                                "reliability": "high",
                            }
                        ],
                        "searches_performed": [],
                    },
                }
            ],
        }
    ]
    mock_turn_result.usage = {"input_tokens": 1500, "output_tokens": 500}
    mock_turn_result.iterations = 8

    mock_runtime = MagicMock()
    mock_runtime.run_turn = AsyncMock(return_value=mock_turn_result)

    return mock_runtime, mock_hook


def _default_triage():
    return TriageResult(action="research", triage_log=[], tokens_used=0)


# Common patches needed by all _research_one tests that reach the runtime
_BATCH_PATCHES = [
    "src.batch.build_user_message",
    "src.batch.build_knowledge_context",
]


# ---------------------------------------------------------------------------
# _extract_agent_result
# ---------------------------------------------------------------------------


class TestExtractAgentResult:
    def test_extracts_from_dict_blocks(self):
        messages = [
            {
                "role": "assistant",
                "content": [
                    {
                        "type": "tool_use",
                        "name": "report_findings",
                        "id": "t1",
                        "input": {
                            "epc_contractor": "Blattner",
                            "confidence": "confirmed",
                            "reasoning": "Multiple sources",
                            "sources": [],
                            "searches_performed": [],
                        },
                    }
                ],
            }
        ]
        result = _extract_agent_result(messages)
        assert result is not None
        assert result.epc_contractor == "Blattner"

    def test_returns_none_when_no_report(self):
        messages = [
            {"role": "assistant", "content": [{"type": "text", "text": "thinking..."}]}
        ]
        assert _extract_agent_result(messages) is None

    def test_extracts_from_sdk_objects(self):
        """Handle Anthropic SDK content block objects (not dicts)."""
        block = MagicMock()
        block.type = "tool_use"
        block.name = "report_findings"
        block.input = {
            "epc_contractor": "Signal Energy",
            "confidence": "likely",
            "reasoning": "Found on OSHA",
            "sources": [],
            "searches_performed": [],
        }
        messages = [{"role": "assistant", "content": [block]}]
        result = _extract_agent_result(messages)
        assert result is not None
        assert result.epc_contractor == "Signal Energy"


# ---------------------------------------------------------------------------
# _research_one
# ---------------------------------------------------------------------------


class TestResearchOne:
    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_successful_research(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        """Normal project -> started + completed callbacks."""
        mock_get_active.return_value = None
        mock_triage.return_value = _default_triage()
        mock_rt, mock_hook = _make_mock_runtime_and_hook()
        mock_build_rt.return_value = (mock_rt, mock_hook)
        mock_store.return_value = _fake_discovery("proj-001")

        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        project = {"id": "proj-001", "queue_id": "Q-1", "project_name": "Solar A"}
        sem = asyncio.Semaphore(3)

        result = await _research_one(project, sem, on_progress)

        assert result["status"] == "completed"
        assert result["discovery"]["id"] == "disc-proj-001"
        assert len(progress_events) == 2
        assert progress_events[0]["status"] == "started"
        assert progress_events[0]["project_name"] == "Solar A"
        assert progress_events[1]["status"] == "completed"

    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    async def test_skips_accepted_discovery(
        self, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        """Project with accepted discovery -> skipped, no agent run."""
        mock_get_active.return_value = {"id": "disc-existing", "review_status": "accepted"}

        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        project = {"id": "proj-001", "queue_id": "Q-1", "project_name": "Solar A"}
        sem = asyncio.Semaphore(3)

        result = await _research_one(project, sem, on_progress)

        assert result["status"] == "skipped"
        assert result["reason"] == "already_accepted"
        mock_build_rt.assert_not_called()
        mock_store.assert_not_called()
        assert len(progress_events) == 1

    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_does_not_skip_pending_discovery(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        """Project with pending (not accepted) discovery -> runs agent."""
        mock_get_active.return_value = {"id": "disc-pending", "review_status": "pending"}
        mock_triage.return_value = _default_triage()
        mock_rt, mock_hook = _make_mock_runtime_and_hook()
        mock_build_rt.return_value = (mock_rt, mock_hook)
        mock_store.return_value = _fake_discovery("proj-001")

        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        project = {"id": "proj-001", "queue_id": "Q-1", "project_name": "Solar A"}
        sem = asyncio.Semaphore(3)

        result = await _research_one(project, sem, on_progress)

        assert result["status"] == "completed"
        mock_rt.run_turn.assert_called_once()

    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_agent_error_returns_error_status(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        """Agent exception -> error result with traceback."""
        mock_get_active.return_value = None
        mock_triage.return_value = _default_triage()
        mock_rt = MagicMock()
        mock_rt.run_turn = AsyncMock(side_effect=RuntimeError("API failure"))
        mock_hook = MagicMock()
        mock_build_rt.return_value = (mock_rt, mock_hook)

        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        project = {"id": "proj-001", "queue_id": "Q-1", "project_name": "Solar A"}
        sem = asyncio.Semaphore(3)

        result = await _research_one(project, sem, on_progress)

        assert result["status"] == "error"
        assert "API failure" in result["error"]
        mock_store.assert_not_called()

    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_uses_queue_id_fallback_for_label(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        """Project without project_name uses queue_id as label."""
        mock_get_active.return_value = None
        mock_triage.return_value = _default_triage()
        mock_rt, mock_hook = _make_mock_runtime_and_hook()
        mock_build_rt.return_value = (mock_rt, mock_hook)
        mock_store.return_value = _fake_discovery("proj-001")

        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        project = {"id": "proj-001", "queue_id": "Q-1", "project_name": None}
        sem = asyncio.Semaphore(3)

        await _research_one(project, sem, on_progress)

        assert progress_events[0]["project_name"] == "Q-1"


# ---------------------------------------------------------------------------
# run_batch — concurrency + gather
# ---------------------------------------------------------------------------


class TestRunBatch:
    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_processes_all_projects(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        mock_get_active.return_value = None
        mock_triage.return_value = _default_triage()
        mock_rt, mock_hook = _make_mock_runtime_and_hook()
        mock_build_rt.return_value = (mock_rt, mock_hook)
        mock_store.side_effect = lambda pid, *a, **kw: _fake_discovery(pid)

        projects = [
            {"id": f"proj-{i}", "queue_id": f"Q-{i}", "project_name": f"Solar {i}"}
            for i in range(5)
        ]

        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        results = await run_batch(projects, on_progress, concurrency=3)

        assert len(results) == 5
        assert all(r["status"] == "completed" for r in results)
        # 5 projects x 2 events each (started + completed) = 10
        assert len(progress_events) == 10

    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_mixed_results(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        """Mix of normal, skipped, and error projects."""

        def get_active(pid):
            if pid == "proj-skip":
                return {"id": "disc-skip", "review_status": "accepted"}
            return None

        mock_get_active.side_effect = get_active
        mock_triage.return_value = _default_triage()

        def build_rt_side_effect(project=None, api_key=None):
            pid = project["id"] if project else "unknown"
            if pid == "proj-err":
                mock_rt_err = MagicMock()
                mock_rt_err.run_turn = AsyncMock(side_effect=RuntimeError("boom"))
                mock_hook_err = MagicMock()
                return (mock_rt_err, mock_hook_err)
            rt, hook = _make_mock_runtime_and_hook()
            return (rt, hook)

        mock_build_rt.side_effect = build_rt_side_effect
        mock_store.side_effect = lambda pid, *a, **kw: _fake_discovery(pid)

        projects = [
            {"id": "proj-ok", "queue_id": "Q-1", "project_name": "Good"},
            {"id": "proj-skip", "queue_id": "Q-2", "project_name": "Skipped"},
            {"id": "proj-err", "queue_id": "Q-3", "project_name": "Error"},
        ]

        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        results = await run_batch(projects, on_progress, concurrency=2)

        statuses = {r["project_id"]: r["status"] for r in results}
        assert statuses["proj-ok"] == "completed"
        assert statuses["proj-skip"] == "skipped"
        assert statuses["proj-err"] == "error"

    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_semaphore_limits_concurrency(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        """At most `concurrency` agents run simultaneously."""
        mock_get_active.return_value = None
        mock_triage.return_value = _default_triage()

        max_concurrent = 0
        current_concurrent = 0
        lock = asyncio.Lock()

        async def slow_run_turn(messages, on_event):
            nonlocal max_concurrent, current_concurrent
            async with lock:
                current_concurrent += 1
                max_concurrent = max(max_concurrent, current_concurrent)
            await asyncio.sleep(0.05)
            async with lock:
                current_concurrent -= 1
            mock_result = MagicMock()
            mock_result.messages = [
                {
                    "role": "assistant",
                    "content": [
                        {
                            "type": "tool_use",
                            "name": "report_findings",
                            "id": "t1",
                            "input": {
                                "epc_contractor": "Test EPC",
                                "confidence": "likely",
                                "reasoning": "Test",
                                "sources": [],
                                "searches_performed": [],
                            },
                        }
                    ],
                }
            ]
            mock_result.usage = {"input_tokens": 100, "output_tokens": 50}
            mock_result.iterations = 3
            return mock_result

        def build_rt_for_concurrency(project=None, api_key=None):
            mock_rt = MagicMock()
            mock_rt.run_turn = AsyncMock(side_effect=slow_run_turn)
            mock_hook = MagicMock()
            mock_hook.agent_log = []
            mock_hook.recent_tool_outputs = []
            return (mock_rt, mock_hook)

        mock_build_rt.side_effect = build_rt_for_concurrency
        mock_store.side_effect = lambda pid, *a, **kw: _fake_discovery(pid)

        projects = [
            {"id": f"proj-{i}", "queue_id": f"Q-{i}", "project_name": f"Solar {i}"}
            for i in range(6)
        ]

        async def on_progress(update):
            pass

        await run_batch(projects, on_progress, concurrency=2)

        assert max_concurrent <= 2

    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_empty_project_list(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        results = await run_batch([], on_progress)

        assert results == []
        assert progress_events == []
        mock_build_rt.assert_not_called()


# ---------------------------------------------------------------------------
# Error isolation (return_exceptions=True safety net)
# ---------------------------------------------------------------------------


class TestBatchErrorIsolation:
    async def test_uncaught_exception_becomes_error_dict(self):
        """If _research_one raises unexpectedly, it becomes an error dict."""
        progress_events = []

        async def on_progress(update):
            progress_events.append(update)

        projects = [
            {"id": "proj-1", "queue_id": "Q-1", "project_name": "Test"},
        ]

        with patch("src.batch._research_one", new_callable=AsyncMock) as mock_ro:
            mock_ro.side_effect = RuntimeError("total crash")
            results = await run_batch(projects, on_progress)

        assert len(results) == 1
        assert results[0]["status"] == "error"
        assert "Uncaught exception" in results[0]["error"]
        assert results[0]["project_id"] == "proj-1"
        assert any(e.get("status") == "error" for e in progress_events)

    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_one_crash_others_still_complete(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store
    ):
        """When one project crashes, others still return results."""
        mock_get_active.return_value = None
        mock_triage.return_value = _default_triage()
        mock_rt, mock_hook = _make_mock_runtime_and_hook()
        mock_build_rt.return_value = (mock_rt, mock_hook)
        mock_store.side_effect = lambda pid, *a, **kw: _fake_discovery(pid)

        projects = [
            {"id": "proj-ok1", "queue_id": "Q-1", "project_name": "Good 1"},
            {"id": "proj-ok2", "queue_id": "Q-2", "project_name": "Good 2"},
        ]

        progress_events = []
        crash_count = 0

        async def on_progress(update):
            nonlocal crash_count
            if update.get("status") == "started" and crash_count == 0:
                crash_count += 1
                raise RuntimeError("callback exploded")
            progress_events.append(update)

        results = await run_batch(projects, on_progress, concurrency=10)

        assert len(results) == 2
        statuses = [r["status"] for r in results]
        assert "completed" in statuses or "error" in statuses

    @patch("src.batch.logger")
    @patch("src.batch.store_discovery")
    @patch("src.batch.build_research_runtime")
    @patch("src.batch.triage_project", new_callable=AsyncMock)
    @patch("src.batch.get_active_discovery")
    @patch("src.batch.build_user_message", return_value="Research this project")
    @patch("src.batch.build_knowledge_context", return_value=None)
    async def test_batch_summary_logging(
        self, mock_kb, mock_msg, mock_get_active, mock_triage, mock_build_rt, mock_store,
        mock_logger,
    ):
        """Batch logs a summary with completed/skipped/error counts."""

        def get_active(pid):
            if pid == "proj-skip":
                return {"id": "d", "review_status": "accepted"}
            return None

        mock_get_active.side_effect = get_active
        mock_triage.return_value = _default_triage()
        mock_rt, mock_hook = _make_mock_runtime_and_hook()
        mock_build_rt.return_value = (mock_rt, mock_hook)
        mock_store.side_effect = lambda pid, *a, **kw: _fake_discovery(pid)

        projects = [
            {"id": "proj-ok", "queue_id": "Q-1", "project_name": "Good"},
            {"id": "proj-skip", "queue_id": "Q-2", "project_name": "Skip"},
        ]

        async def on_progress(update):
            pass

        await run_batch(projects, on_progress)

        mock_logger.info.assert_called_once()
        log_msg = mock_logger.info.call_args[0][0]
        assert "Batch complete" in log_msg
