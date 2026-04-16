"""Tests for fetch_page EPC keyword extraction."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.tools.fetch_page import (
    _EPC_KEYWORDS,
    _MAX_CHARS,
    _extract_relevant_sections,
)
from src.tools.fetch_page import (
    execute as fetch_page_execute,
)


class TestExtractRelevantSections:
    def test_returns_only_keyword_paragraphs(self):
        """Article with EPC keywords in 2/8 paragraphs -> returns only those 2."""
        paragraphs = [
            "The weather was nice on Tuesday.",
            "Local officials met to discuss zoning.",
            "McCarthy Building was awarded the EPC contract for a 200MW solar farm.",
            "Stock markets closed higher on Friday.",
            "The project will reach commercial operation date by Q4 2026.",
            "A new restaurant opened downtown.",
            "City council approved the budget.",
            "Traffic was diverted due to road work.",
        ]
        text = "\n\n".join(paragraphs)
        result = _extract_relevant_sections(text)

        assert "McCarthy Building" in result
        assert "commercial operation" in result
        assert "weather was nice" not in result
        assert "restaurant opened" not in result

    def test_zero_keywords_falls_back_to_truncation(self):
        """Article with zero EPC keywords -> falls back to head truncation."""
        filler = "This paragraph is about cooking recipes and nothing else."
        paragraphs = [filler] * 100
        text = "\n\n".join(paragraphs)
        assert len(text) > _MAX_CHARS

        result = _extract_relevant_sections(text)

        assert result.endswith("[... truncated]")
        assert len(result) <= _MAX_CHARS + 50

    def test_short_text_with_no_keywords_returned_as_is(self):
        """Short article with no keywords, under _MAX_CHARS -> returned as-is."""
        text = "This is a short unrelated article.\n\nNothing to see here."
        result = _extract_relevant_sections(text)
        assert result == text

    def test_empty_text_returns_empty(self):
        """Empty text -> returns empty string."""
        assert _extract_relevant_sections("") == ""

    def test_keyword_matching_is_case_insensitive(self):
        """Keywords match regardless of case."""
        text = "BLATTNER ENERGY awarded SOLAR EPC contract.\n\nUnrelated paragraph about gardening."
        result = _extract_relevant_sections(text)
        assert "BLATTNER" in result

    def test_result_capped_at_max_chars(self):
        """Even if many paragraphs match, result is capped at _MAX_CHARS."""
        para = "McCarthy was awarded the EPC contract for a 500MW solar farm near Austin."
        paragraphs = [para] * 200
        text = "\n\n".join(paragraphs)

        result = _extract_relevant_sections(text)
        assert len(result) <= _MAX_CHARS + 50
        assert result.endswith("[... truncated]")

    def test_preserves_paragraph_order(self):
        """Relevant paragraphs appear in original order."""
        text = (
            "Filler paragraph one.\n\n"
            "Primoris was named EPC for Phase 1.\n\n"
            "Another filler paragraph.\n\n"
            "Rosendin will handle the electrical construction scope.\n\n"
            "Final filler."
        )
        result = _extract_relevant_sections(text)
        assert result.index("Primoris") < result.index("Rosendin")

    def test_header_shows_extraction_counts(self):
        """Result includes a header with extraction counts."""
        paragraphs = [
            "Unrelated content here.",
            "Blattner was selected as the EPC contractor.",
            "More unrelated content.",
        ]
        text = "\n\n".join(paragraphs)
        result = _extract_relevant_sections(text)
        assert "[Extracted 1/3 paragraphs matching EPC keywords]" in result

    def test_known_epc_companies_in_keywords(self):
        """All specified EPC company names are in the keyword set."""
        expected = [
            "blattner",
            "mccarthy",
            "mortenson",
            "primoris",
            "rosendin",
            "swinerton",
            "mas energy",
            "signal energy",
            "strata solar",
            "sunpin solar",
        ]
        for name in expected:
            assert name in _EPC_KEYWORDS, f"{name} missing from _EPC_KEYWORDS"


class TestFirecrawlFallback:
    """Tests for the Firecrawl fallback behaviour in fetch_page.execute()."""

    def _make_mock_response(self, html: str = "<html><body>content</body></html>"):
        mock_response = AsyncMock()
        mock_response.text = html
        mock_response.content = b""
        mock_response.headers = {"content-type": "text/html"}
        return mock_response

    @pytest.mark.asyncio
    async def test_falls_back_to_firecrawl_when_trafilatura_returns_none(self):
        """When trafilatura returns None, _firecrawl_fallback is called and its result returned."""
        mock_response = self._make_mock_response()
        fallback_result = {
            "url": "https://example.com",
            "text": "JS-rendered content",
            "length": 19,
        }

        with (
            patch("src.tools.fetch_page._fetch_with_retry", return_value=mock_response),
            patch("trafilatura.extract", return_value=None),
            patch(
                "src.tools.fetch_page._firecrawl_fallback",
                new_callable=AsyncMock,
                return_value=fallback_result,
            ) as mock_fallback,
        ):
            result = await fetch_page_execute({"url": "https://example.com"})

        mock_fallback.assert_called_once_with("https://example.com")
        assert result == fallback_result

    @pytest.mark.asyncio
    async def test_falls_back_when_trafilatura_returns_short_text(self):
        """When trafilatura returns very short text (< 100 chars), fallback fires."""
        mock_response = self._make_mock_response()
        short_text = "Enable JavaScript and cookies to continue"  # 41 chars
        fallback_result = {
            "url": "https://example.com",
            "text": "Real JS content here",
            "length": 20,
        }

        with (
            patch("src.tools.fetch_page._fetch_with_retry", return_value=mock_response),
            patch("trafilatura.extract", return_value=short_text),
            patch(
                "src.tools.fetch_page._firecrawl_fallback",
                new_callable=AsyncMock,
                return_value=fallback_result,
            ) as mock_fallback,
        ):
            result = await fetch_page_execute({"url": "https://example.com"})

        mock_fallback.assert_called_once_with("https://example.com")
        assert result == fallback_result

    @pytest.mark.asyncio
    async def test_returns_error_when_both_trafilatura_and_firecrawl_fail(self):
        """When both trafilatura and Firecrawl fail, an error dict is returned."""
        mock_response = self._make_mock_response()
        fallback_error = {"error": "Firecrawl API error: 403"}

        with (
            patch("src.tools.fetch_page._fetch_with_retry", return_value=mock_response),
            patch("trafilatura.extract", return_value=None),
            patch(
                "src.tools.fetch_page._firecrawl_fallback",
                new_callable=AsyncMock,
                return_value=fallback_error,
            ),
        ):
            result = await fetch_page_execute({"url": "https://example.com"})

        assert "error" in result
        assert "extract" in result["error"].lower() or "Could not" in result["error"]

    @pytest.mark.asyncio
    async def test_no_fallback_when_trafilatura_succeeds(self):
        """When trafilatura returns sufficient text (>= 100 chars), fallback is NOT called."""
        mock_response = self._make_mock_response()
        long_text = "A" * 200  # well over 100 char threshold

        with (
            patch("src.tools.fetch_page._fetch_with_retry", return_value=mock_response),
            patch("trafilatura.extract", return_value=long_text),
            patch(
                "src.tools.fetch_page._firecrawl_fallback",
                new_callable=AsyncMock,
            ) as mock_fallback,
        ):
            result = await fetch_page_execute({"url": "https://example.com"})

        mock_fallback.assert_not_called()
        assert "text" in result
        assert "error" not in result

    @pytest.mark.asyncio
    async def test_no_fallback_when_firecrawl_key_missing(self):
        """When trafilatura returns None and FIRECRAWL_API_KEY is missing, error is returned."""
        mock_response = self._make_mock_response()
        key_missing_error = {"error": "FIRECRAWL_API_KEY not set — cannot fall back to Firecrawl."}

        with (
            patch("src.tools.fetch_page._fetch_with_retry", return_value=mock_response),
            patch("trafilatura.extract", return_value=None),
            patch(
                "src.tools.fetch_page._firecrawl_fallback",
                new_callable=AsyncMock,
                return_value=key_missing_error,
            ),
        ):
            result = await fetch_page_execute({"url": "https://example.com"})

        assert "error" in result
