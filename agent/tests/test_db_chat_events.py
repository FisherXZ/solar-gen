"""Tests for log_chat_event() and updated save_message() token params."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import src.db as db


# ---------------------------------------------------------------------------
# log_chat_event
# ---------------------------------------------------------------------------


class TestLogChatEvent:
    @patch("src.db.get_client")
    def test_inserts_row_with_correct_fields(self, mock_get_client):
        mock_table = MagicMock()
        mock_get_client.return_value.table.return_value = mock_table

        db.log_chat_event("conv-abc", 2, "tool_called", {"tool_name": "web_search"})

        mock_get_client.return_value.table.assert_called_once_with("chat_events")
        mock_table.insert.assert_called_once_with({
            "conversation_id": "conv-abc",
            "turn_number": 2,
            "event_type": "tool_called",
            "data": {"tool_name": "web_search"},
        })
        mock_table.insert.return_value.execute.assert_called_once()

    @patch("src.db.get_client")
    def test_swallows_exception_without_raising(self, mock_get_client):
        mock_get_client.return_value.table.side_effect = RuntimeError("DB down")

        # Must not raise — fire-and-forget semantics
        db.log_chat_event("conv-xyz", 0, "turn_started", {})

    @patch("src.db.get_client")
    def test_empty_data_dict_allowed(self, mock_get_client):
        mock_table = MagicMock()
        mock_get_client.return_value.table.return_value = mock_table

        db.log_chat_event("conv-abc", 0, "agent_finished", {})

        mock_table.insert.assert_called_once_with({
            "conversation_id": "conv-abc",
            "turn_number": 0,
            "event_type": "agent_finished",
            "data": {},
        })


# ---------------------------------------------------------------------------
# save_message — token parameters
# ---------------------------------------------------------------------------


class TestSaveMessageTokens:
    @patch("src.db.get_client")
    def test_token_params_included_in_insert(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "msg-1"}
        ]

        db.save_message(
            conversation_id="conv-abc",
            role="assistant",
            content="Hello",
            input_tokens=500,
            output_tokens=120,
            cache_read_tokens=400,
            cache_write_tokens=10,
            iterations=3,
        )

        inserted_data = mock_client.table.return_value.insert.call_args[0][0]
        assert inserted_data["input_tokens"] == 500
        assert inserted_data["output_tokens"] == 120
        assert inserted_data["cache_read_tokens"] == 400
        assert inserted_data["cache_write_tokens"] == 10
        assert inserted_data["iterations"] == 3

    @patch("src.db.get_client")
    def test_token_params_omitted_when_none(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "msg-1"}
        ]

        db.save_message(
            conversation_id="conv-abc",
            role="assistant",
            content="Hello",
        )

        inserted_data = mock_client.table.return_value.insert.call_args[0][0]
        assert "input_tokens" not in inserted_data
        assert "output_tokens" not in inserted_data
        assert "iterations" not in inserted_data
