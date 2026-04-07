"""Tests for AgentJob heartbeats and memory cap."""
from __future__ import annotations

import asyncio

import pytest

from src.agent_jobs import MAX_EVENT_BYTES, AgentJob


class TestHeartbeats:
    @pytest.mark.asyncio
    async def test_ping_emitted_when_idle(self):
        """A ping comment is emitted when job is idle (with tiny interval)."""
        from src.main import _stream_from_job

        job = AgentJob(job_id="j1", conversation_id="c1")
        job.done = False

        events = []
        async def collect():
            async for chunk in _stream_from_job(job, cursor=0, ping_interval=0.05):
                events.append(chunk)
                if ": ping" in chunk:
                    job.done = True  # stop after first ping

        await asyncio.wait_for(collect(), timeout=2.0)
        assert any(": ping" in e for e in events)

    @pytest.mark.asyncio
    async def test_ping_not_emitted_when_events_flowing(self):
        """No ping is emitted when events arrive quickly (long interval)."""
        from src.main import _stream_from_job

        job = AgentJob(job_id="j2", conversation_id="c2")
        job.events = [f"id: {i}\ndata: {{\"type\": \"text-delta\", \"delta\": \"x\"}}\n\n"
                      for i in range(5)]
        job.done = True

        events = []
        async for chunk in _stream_from_job(job, cursor=0, ping_interval=60.0):
            events.append(chunk)

        assert not any(": ping" in e for e in events)
        assert len(events) == 5


class TestMemoryCap:
    def test_events_stored_under_cap(self):
        job = AgentJob(job_id="j3", conversation_id="c3")
        event = "id: 0\ndata: {}\n\n"
        job.append_event(event)
        assert len(job.events) == 1

    def test_events_dropped_over_cap(self):
        job = AgentJob(job_id="j4", conversation_id="c4")
        big_event = "x" * (MAX_EVENT_BYTES + 1)
        job.append_event("id: 0\ndata: {}\n\n")  # first event fits
        job.append_event(big_event)              # this one exceeds cap
        assert len(job.events) == 1              # only the first was stored

    def test_notify_still_called_when_dropped(self):
        """Even when event is dropped from log, waiters are still notified."""
        job = AgentJob(job_id="j5", conversation_id="c5")
        job._total_bytes = MAX_EVENT_BYTES  # fill to cap

        notified = []

        async def run():
            task_a = asyncio.create_task(job.wait_for_update(timeout=0.5))
            await asyncio.sleep(0.01)
            job.append_event("id: 0\ndata: {}\n\n")  # dropped but still notifies
            result = await task_a
            notified.append(result)

        asyncio.run(run())
        assert notified == [True]
