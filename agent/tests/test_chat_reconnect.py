"""Tests for Last-Event-ID reconnect in /api/chat."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from src.agent_jobs import AgentJob
from src.main import app


@pytest.fixture
def client():
    from src.main import require_auth
    app.dependency_overrides[require_auth] = lambda: "test-user"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_last_event_id_reconnects_to_existing_job(client):
    """If Last-Event-ID header is present and a job exists, replay from cursor."""
    job = AgentJob(job_id="job-123", conversation_id="conv-abc")
    job.events = [
        'id: 0\ndata: {"type":"start"}\n\n',
        'id: 1\ndata: {"type":"start-step"}\n\n',
        'id: 2\ndata: {"type":"finish-step"}\n\n',
    ]
    job.done = True

    with patch("src.main.get_active_job_for_conversation", return_value=job):
        response = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "hi"}],
                  "conversation_id": "conv-abc"},
            headers={"last-event-id": "0"},  # client saw event 0, wants 1+
        )

    assert response.status_code == 200
    body = response.content.decode()
    # Should replay from cursor=1 (events 1 and 2 only, not event 0)
    assert "start-step" in body
    assert "finish-step" in body
    # Event 0 (start) should NOT be replayed
    assert body.count('"type":"start"') == 0


def test_last_event_id_falls_through_when_no_job(client):
    """If Last-Event-ID is present but no job exists, fall through to normal path."""
    # Patch get_active_job_for_conversation to return None (job expired)
    # The request should NOT raise an error — it falls through to the new-agent path
    # We can verify this by checking we don't get a 404/500 from the reconnect block itself
    with patch("src.main.get_active_job_for_conversation", return_value=None), \
         patch("src.main.db.save_message"), \
         patch("src.main.create_job") as mock_create_job, \
         patch("src.main.asyncio.create_task"), \
         patch("src.main.set_task"):
        mock_job = AgentJob(job_id="new-job", conversation_id="conv-abc")
        mock_job.done = True
        mock_create_job.return_value = mock_job
        response = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "hi"}],
                  "conversation_id": "conv-abc"},
            headers={"last-event-id": "5"},
        )
    # Should not be 404 or 500 from the reconnect block — it fell through
    assert response.status_code == 200


def test_invalid_last_event_id_defaults_to_cursor_zero(client):
    """Malformed Last-Event-ID value defaults to cursor=0 (full replay)."""
    job = AgentJob(job_id="job-xyz", conversation_id="conv-def")
    job.events = [
        'id: 0\ndata: {"type":"start"}\n\n',
        'id: 1\ndata: {"type":"finish"}\n\n',
    ]
    job.done = True

    with patch("src.main.get_active_job_for_conversation", return_value=job):
        response = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "hi"}],
                  "conversation_id": "conv-def"},
            headers={"last-event-id": "not-a-number"},
        )

    assert response.status_code == 200
    body = response.content.decode()
    # cursor=0 means full replay — both events should be present
    assert "start" in body
    assert "finish" in body
