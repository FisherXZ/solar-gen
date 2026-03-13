"use client";

import { EpcSource } from "@/lib/types";
import SourceQualityBadges from "./SourceQualityBadges";

interface SourceCardProps {
  source: EpcSource;
}

const SOURCE_METHOD_LABELS: Record<string, string> = {
  brave_search: "Brave Web Search",
  tavily_search: "Tavily Deep Search",
  page_fetch: "Direct Page Fetch",
  iso_filing: "ISO Queue Filing",
  knowledge_base: "Knowledge Base",
};

const CHANNEL_LABELS: Record<string, string> = {
  developer_pr: "Developer PR",
  trade_publication: "Trade Publication",
  permit_filing: "Permit Filing",
  regulatory_filing: "Regulatory Filing",
  news_article: "News Article",
  company_website: "Company Website",
  sec_filing: "SEC Filing",
  linkedin: "LinkedIn",
  conference: "Conference",
};

const RELIABILITY_COLORS: Record<string, string> = {
  high: "bg-status-green",
  medium: "bg-status-amber",
  low: "bg-status-red",
};

function formatChannelLabel(channel: string): string {
  return (
    CHANNEL_LABELS[channel] ||
    channel
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getSourceLink(source: EpcSource): {
  href: string;
  label: string;
} | null {
  const url = source.url;

  // Case 1: Normal URL — only allow http(s) to prevent XSS via javascript: URIs
  if (url && !url.startsWith("search:")) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return { href: url, label: "View source" };
    }
    // Non-http URL (e.g. javascript:) — treat as no URL
    return null;
  }

  // Case 2: URL starts with "search:" — Google search link
  if (url && url.startsWith("search:")) {
    const query = url.slice("search:".length);
    return {
      href: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      label: "Search for source",
    };
  }

  // Case 3: No URL but search_query exists
  if (!url && source.search_query) {
    return {
      href: `https://www.google.com/search?q=${encodeURIComponent(source.search_query)}`,
      label: "Search for source",
    };
  }

  return null;
}

const CITATION_RATIONALE: Record<string, string> = {
  regulatory_filing: "This regulatory filing directly names the EPC contractor",
  sec_filing: "Found in a legally binding SEC filing",
  epc_portfolio: "Found on the contractor's own portfolio page",
  company_website: "Listed on the company's official website",
  developer_pr: "Announced by the project developer",
  trade_publication: "Reported by an industry trade publication",
  news_article: "Covered by a news outlet",
  permit_filing: "Referenced in a permit or planning filing",
  linkedin: "Found on a LinkedIn profile or post",
  conference: "Mentioned at an industry conference or event",
};

function WhyCited({ source }: { source: EpcSource }) {
  const rationale = CITATION_RATIONALE[source.channel];
  if (!rationale) return null;

  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors list-none flex items-center gap-1">
        <svg
          className="h-3 w-3 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        Why cited?
      </summary>
      <p className="mt-1 text-xs text-text-tertiary">{rationale}</p>
    </details>
  );
}

export default function SourceCard({ source }: SourceCardProps) {
  const reliabilityColor =
    RELIABILITY_COLORS[source.reliability] || RELIABILITY_COLORS.low;

  const link = getSourceLink(source);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-overlay p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <span className="text-sm font-medium text-text-primary">
              {formatChannelLabel(source.channel)}
            </span>
            {source.source_method && (
              <span className="ml-1 text-xs text-text-tertiary">
                via {SOURCE_METHOD_LABELS[source.source_method] || source.source_method}
              </span>
            )}
          </div>
          <SourceQualityBadges source={source} />
          <span
            className={`inline-block h-2 w-2 rounded-full ${reliabilityColor}`}
            title={`${source.reliability} reliability`}
          />
        </div>
        {source.date && (
          <span className="text-xs text-text-tertiary">{source.date}</span>
        )}
      </div>

      {source.publication && (
        <p className="mb-1 text-xs font-medium text-text-secondary">
          {source.publication}
        </p>
      )}

      <p className="text-sm leading-relaxed text-text-secondary">
        {source.excerpt}
      </p>

      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-accent-amber hover:text-accent-amber/80"
        >
          {link.label}
        </a>
      )}

      {/* Why cited? */}
      <WhyCited source={source} />
    </div>
  );
}
