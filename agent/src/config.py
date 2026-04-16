"""Centralized research pipeline configuration.

All magic numbers and tunables for the research loop live here.
Imported by research.py, agents/research.py, batch.py, completeness.py.
"""

from __future__ import annotations

import os

# --- Model ---
RESEARCH_MODEL = os.environ.get("RESEARCH_MODEL", "claude-sonnet-4-6")

# --- Iteration budgets ---
MAX_ITERATIONS = 25
# At this iteration, strip all tools except report_findings to force conclusion
HARD_STOP_ITERATION = 22
# Planning phase: quick KB + web search, not a full research run
MAX_PLANNING_ITERATIONS = 5

# --- Completeness checkpoints (Harvey AI pattern) ---
# Maps effective-iteration -> escalation level
COMPLETENESS_CHECKPOINTS: dict[int, str] = {
    6: "gentle",
    12: "firm",
    18: "mandatory",
}

# --- Batch ---
DEFAULT_BATCH_CONCURRENCY = 10

# --- AgentRuntime escalation (agents/research.py) ---
RUNTIME_MAX_ITERATIONS = 25  # Was 30, canonicalized to match research.py
RUNTIME_MIN_STAGNATION_ITERATIONS = 6
