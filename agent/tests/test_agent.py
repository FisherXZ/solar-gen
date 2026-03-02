"""Tests for agent.py — async agent loop."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from src.agent import run_agent_async
from src.models import AgentResult

from tests.conftest import (
    make_claude_response,
    make_tool_use_block,
    make_text_block,
)


# ---------------------------------------------------------------------------
# Immediate report_findings (search → report in one turn)
# ---------------------------------------------------------------------------

class TestReportFindings:
    @patch("src.agent.tavily_search")
    @patch("src.agent.anthropic.AsyncAnthropic")
    async def test_single_turn_report(self, MockClient, mock_tavily, sample_project):
        """Agent calls report_findings on the first tool_use turn."""
        report_block = make_tool_use_block(
            name="report_findings",
            block_id="rf-1",
            input_data={
                "epc_contractor": "Blattner Energy",
                "confidence": "confirmed",
                "sources": [
                    {
                        "channel": "trade_publication",
                        "publication": "SPW",
                        "excerpt": "Blattner awarded",
                        "reliability": "high",
                    }
                ],
                "reasoning": "Two sources confirm.",
                "searches_performed": ["query 1"],
                "related_findings": [],
            },
        )

        resp = make_claude_response(
            stop_reason="tool_use",
            content=[report_block],
            input_tokens=200,
            output_tokens=100,
        )

        mock_client = MagicMock()
        mock_client.messages = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=resp)
        MockClient.return_value = mock_client

        result, log, tokens = await run_agent_async(sample_project)

        assert isinstance(result, AgentResult)
        assert result.epc_contractor == "Blattner Energy"
        assert result.confidence == "confirmed"
        assert len(result.sources) == 1
        assert result.sources[0].channel == "trade_publication"
        assert result.reasoning == "Two sources confirm."
        assert tokens == 300

    @patch("src.agent.tavily_search")
    @patch("src.agent.anthropic.AsyncAnthropic")
    async def test_report_with_null_epc(self, MockClient, mock_tavily, sample_project):
        """Agent reports unknown with null epc_contractor."""
        report_block = make_tool_use_block(
            name="report_findings",
            block_id="rf-2",
            input_data={
                "epc_contractor": None,
                "confidence": "unknown",
                "reasoning": "No evidence found.",
                "searches_performed": ["dead end query"],
            },
        )
        resp = make_claude_response(
            stop_reason="tool_use",
            content=[report_block],
        )

        mock_client = MagicMock()
        mock_client.messages = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=resp)
        MockClient.return_value = mock_client

        result, log, tokens = await run_agent_async(sample_project)

        assert result.epc_contractor is None
        assert result.confidence == "unknown"
        assert result.sources == []


# ---------------------------------------------------------------------------
# Web search → report_findings (multi-turn)
# ---------------------------------------------------------------------------

class TestMultiTurn:
    @patch("src.agent.tavily_search")
    @patch("src.agent.anthropic.AsyncAnthropic")
    async def test_search_then_report(self, MockClient, mock_tavily, sample_project):
        """Agent does a web_search, then calls report_findings."""
        # Turn 1: web_search
        search_block = make_tool_use_block(
            name="web_search",
            block_id="ws-1",
            input_data={"query": "SunDev Sunrise Solar EPC contractor"},
        )
        turn1 = make_claude_response(
            stop_reason="tool_use",
            content=[search_block],
            input_tokens=150,
            output_tokens=80,
        )
        mock_tavily.return_value = [
            {"title": "Article", "url": "https://example.com", "content": "Blattner EPC", "score": 0.9}
        ]

        # Turn 2: report_findings
        report_block = make_tool_use_block(
            name="report_findings",
            block_id="rf-3",
            input_data={
                "epc_contractor": "Blattner Energy",
                "confidence": "likely",
                "sources": [{"channel": "news_article", "excerpt": "Blattner"}],
                "reasoning": "Found news article.",
                "searches_performed": ["SunDev Sunrise Solar EPC contractor"],
            },
        )
        turn2 = make_claude_response(
            stop_reason="tool_use",
            content=[report_block],
            input_tokens=300,
            output_tokens=120,
        )

        mock_client = MagicMock()
        mock_client.messages = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=[turn1, turn2])
        MockClient.return_value = mock_client

        result, log, tokens = await run_agent_async(sample_project)

        assert result.epc_contractor == "Blattner Energy"
        assert result.confidence == "likely"
        assert tokens == 150 + 80 + 300 + 120
        # Log should have 2 iterations + a web_search entry
        assert any(entry.get("tool") == "web_search" for entry in log)
        assert mock_tavily.call_count == 1


# ---------------------------------------------------------------------------
# End turn (model finishes without report_findings)
# ---------------------------------------------------------------------------

class TestEndTurn:
    @patch("src.agent.tavily_search")
    @patch("src.agent.anthropic.AsyncAnthropic")
    async def test_end_turn_extracts_text(self, MockClient, mock_tavily, sample_project):
        text_block = make_text_block("I could not determine the EPC.")
        resp = make_claude_response(
            stop_reason="end_turn",
            content=[text_block],
            input_tokens=100,
            output_tokens=40,
        )

        mock_client = MagicMock()
        mock_client.messages = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=resp)
        MockClient.return_value = mock_client

        result, log, tokens = await run_agent_async(sample_project)

        assert result.reasoning == "I could not determine the EPC."
        assert result.epc_contractor is None
        assert tokens == 140


# ---------------------------------------------------------------------------
# Max iterations
# ---------------------------------------------------------------------------

class TestMaxIterations:
    @patch("src.agent.MAX_ITERATIONS", 2)
    @patch("src.agent.tavily_search")
    @patch("src.agent.anthropic.AsyncAnthropic")
    async def test_max_iterations_returns_fallback(self, MockClient, mock_tavily, sample_project):
        """If agent hits max iterations without report_findings, return fallback."""
        search_block = make_tool_use_block(
            name="web_search",
            block_id="ws-loop",
            input_data={"query": "search forever"},
        )
        resp = make_claude_response(
            stop_reason="tool_use",
            content=[search_block],
        )
        mock_tavily.return_value = []

        mock_client = MagicMock()
        mock_client.messages = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=resp)
        MockClient.return_value = mock_client

        result, log, tokens = await run_agent_async(sample_project)

        assert "Max iterations" in result.reasoning
        assert mock_client.messages.create.call_count == 2


# ---------------------------------------------------------------------------
# Web search error handling
# ---------------------------------------------------------------------------

class TestSearchErrors:
    @patch("src.agent.tavily_search")
    @patch("src.agent.anthropic.AsyncAnthropic")
    async def test_search_error_feeds_back_error(self, MockClient, mock_tavily, sample_project):
        """Tavily exception → error tool_result fed back, loop continues."""
        search_block = make_tool_use_block(
            name="web_search",
            block_id="ws-err",
            input_data={"query": "bad query"},
        )
        turn1 = make_claude_response(
            stop_reason="tool_use",
            content=[search_block],
        )
        mock_tavily.side_effect = RuntimeError("Tavily API down")

        # Turn 2: agent gives up and reports
        report_block = make_tool_use_block(
            name="report_findings",
            block_id="rf-err",
            input_data={
                "confidence": "unknown",
                "reasoning": "Search failed.",
                "searches_performed": ["bad query"],
            },
        )
        turn2 = make_claude_response(
            stop_reason="tool_use",
            content=[report_block],
        )

        mock_client = MagicMock()
        mock_client.messages = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=[turn1, turn2])
        MockClient.return_value = mock_client

        result, log, tokens = await run_agent_async(sample_project)

        assert result.confidence == "unknown"

    @patch("src.agent.tavily_search")
    @patch("src.agent.anthropic.AsyncAnthropic")
    async def test_max_results_capped_at_10(self, MockClient, mock_tavily, sample_project):
        """max_results in tool input is capped at 10."""
        search_block = make_tool_use_block(
            name="web_search",
            block_id="ws-cap",
            input_data={"query": "big search", "max_results": 50},
        )
        turn1 = make_claude_response(stop_reason="tool_use", content=[search_block])
        mock_tavily.return_value = []

        report_block = make_tool_use_block(
            name="report_findings",
            block_id="rf-cap",
            input_data={
                "confidence": "unknown",
                "reasoning": "Nothing.",
                "searches_performed": ["big search"],
            },
        )
        turn2 = make_claude_response(stop_reason="tool_use", content=[report_block])

        mock_client = MagicMock()
        mock_client.messages = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=[turn1, turn2])
        MockClient.return_value = mock_client

        await run_agent_async(sample_project)

        mock_tavily.assert_called_once_with("big search", max_results=10)


# ---------------------------------------------------------------------------
# Token counting
# ---------------------------------------------------------------------------

class TestTokenCounting:
    @patch("src.agent.tavily_search")
    @patch("src.agent.anthropic.AsyncAnthropic")
    async def test_tokens_accumulated_across_turns(self, MockClient, mock_tavily, sample_project):
        search_block = make_tool_use_block(
            name="web_search", block_id="ws-t", input_data={"query": "q"},
        )
        turn1 = make_claude_response(
            stop_reason="tool_use", content=[search_block],
            input_tokens=500, output_tokens=200,
        )
        mock_tavily.return_value = []

        report_block = make_tool_use_block(
            name="report_findings", block_id="rf-t",
            input_data={"confidence": "unknown", "reasoning": "x", "searches_performed": ["q"]},
        )
        turn2 = make_claude_response(
            stop_reason="tool_use", content=[report_block],
            input_tokens=800, output_tokens=150,
        )

        mock_client = MagicMock()
        mock_client.messages = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=[turn1, turn2])
        MockClient.return_value = mock_client

        _, _, tokens = await run_agent_async(sample_project)

        assert tokens == 500 + 200 + 800 + 150
