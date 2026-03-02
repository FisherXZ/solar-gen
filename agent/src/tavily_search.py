"""Tavily web search wrapper for the EPC discovery agent."""

from __future__ import annotations

import os

from tavily import TavilyClient


_client: TavilyClient | None = None


def _get_client() -> TavilyClient:
    global _client
    if _client is None:
        _client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
    return _client


def search(query: str, max_results: int = 5) -> list[dict]:
    """Run a Tavily web search and return simplified results.

    Each result contains: title, url, content (snippet), score.
    """
    client = _get_client()
    response = client.search(
        query=query,
        max_results=max_results,
        include_answer=False,
        search_depth="advanced",
    )
    results = []
    for r in response.get("results", []):
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
            "score": r.get("score", 0),
        })
    return results
