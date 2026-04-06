"""Think tool — reasoning pause without external action.

Lets the agent pause and reason through a decision instead of being
forced to take an external action every turn. The thought is recorded
in the conversation context but doesn't hit any API or database.

Inspired by Anthropic's "think" tool pattern.
"""

from __future__ import annotations

DEFINITION = {
    "name": "think",
    "description": (
        "Pause to reason about your findings, evaluate your progress, "
        "or plan your next steps. Use this when you need to think through "
        "a decision before acting — e.g., weighing conflicting evidence, "
        "deciding which phase to enter next, or assessing whether a candidate "
        "EPC is credible. Your thought is recorded in conversation context."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "thought": {
                "type": "string",
                "description": "Your reasoning, analysis, or evaluation.",
            }
        },
        "required": ["thought"],
    },
}


async def execute(tool_input: dict) -> dict:
    return {"recorded": True}
