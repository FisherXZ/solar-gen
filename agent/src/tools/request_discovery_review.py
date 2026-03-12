"""Present a discovery finding for human approval.

Renders a clean card in chat showing the EPC, confidence, sources,
and the agent's assessment. User can approve, reject (with reason),
or ask the agent to keep researching.

This tool PAUSES execution — the agent should wait for the user's
response before proceeding.
"""

from __future__ import annotations

DEFINITION = {
    "name": "request_discovery_review",
    "description": (
        "Present your EPC discovery finding for human approval. Shows a clean "
        "card with EPC name, confidence, sources, and your assessment. The user "
        "can approve, reject (with reason), or ask you to keep researching. "
        "Call this AFTER report_findings to let the user review before finalizing."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "discovery_id": {
                "type": "string",
                "description": "The discovery ID returned by report_findings.",
            },
            "epc_contractor": {
                "type": "string",
                "description": "The EPC contractor name found (or 'Unknown').",
            },
            "confidence": {
                "type": "string",
                "enum": ["confirmed", "likely", "possible", "unknown"],
                "description": "Confidence level of the finding.",
            },
            "source_summary": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Abbreviated source list — one line per source (e.g. 'Solar Power World — McCarthy selected for 200MW project').",
            },
            "assessment": {
                "type": "string",
                "description": "Your completeness assessment: what you found, confidence justification, and any gaps.",
            },
        },
        "required": ["epc_contractor", "confidence", "source_summary", "assessment"],
    },
}


async def execute(tool_input: dict) -> dict:
    # Echo back for frontend rendering — same pattern as request_guidance
    return {**tool_input, "awaiting_review": True}
