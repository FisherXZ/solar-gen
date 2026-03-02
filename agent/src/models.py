"""Pydantic models for API request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel


class DiscoverRequest(BaseModel):
    project_id: str


class BatchDiscoverRequest(BaseModel):
    project_ids: list[str]


class ReviewRequest(BaseModel):
    action: str  # "accepted" or "rejected"


class EpcSource(BaseModel):
    channel: str
    publication: str | None = None
    date: str | None = None
    url: str | None = None
    excerpt: str
    reliability: str = "medium"  # high / medium / low


class AgentResult(BaseModel):
    epc_contractor: str | None = None
    confidence: str = "unknown"  # confirmed / likely / possible / unknown
    sources: list[EpcSource] = []
    reasoning: str = ""
    related_leads: list[dict] = []
    searches_performed: list[str] = []


class ChatMessagePart(BaseModel):
    type: str
    text: str | None = None


class ChatMessage(BaseModel):
    role: str
    content: str | None = None  # v3 SDK sends content
    parts: list[ChatMessagePart] | None = None  # v6 SDK sends parts

    def get_text(self) -> str:
        """Extract text content from either format."""
        if self.content:
            return self.content
        if self.parts:
            return " ".join(p.text for p in self.parts if p.type == "text" and p.text)
        return ""


class ChatRequest(BaseModel):
    id: str | None = None  # chat ID from AI SDK
    messages: list[ChatMessage]
    conversation_id: str | None = None  # None = new conversation


class EpcDiscoveryResponse(BaseModel):
    id: str
    project_id: str
    epc_contractor: str
    confidence: str
    sources: list[dict]
    reasoning: str | None
    related_leads: list[dict]
    review_status: str
    tokens_used: int
    created_at: str
    updated_at: str
