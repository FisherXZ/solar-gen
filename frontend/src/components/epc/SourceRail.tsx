"use client";

import { EpcSource } from "@/lib/types";
import SourceQualityBadges from "./SourceQualityBadges";

interface SourceRailProps {
  sources: EpcSource[];
  onSourceClick?: (index: number) => void;
}

function getDomain(url: string): string | null {
  if (!url || url.startsWith("search:")) return null;
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return null;
  }
}

function getSourcePillHref(source: EpcSource): string | null {
  const url = source.url;
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url;
  }
  if (url && url.startsWith("search:")) {
    const query = url.slice("search:".length);
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }
  if (!url && source.search_query) {
    return `https://www.google.com/search?q=${encodeURIComponent(source.search_query)}`;
  }
  return null;
}

const RELIABILITY_DOT: Record<string, string> = {
  high: "bg-status-green",
  medium: "bg-status-amber",
  low: "bg-status-red",
};

export default function SourceRail({ sources, onSourceClick }: SourceRailProps) {
  if (sources.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {sources.map((s, i) => {
        const domain = getDomain(s.url || "");
        const href = getSourcePillHref(s);
        const isSearch = !domain;
        const reliabilityDot = RELIABILITY_DOT[s.reliability] || RELIABILITY_DOT.low;

        const pillContent = (
          <>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-[10px] font-bold text-text-secondary">
              {i + 1}
            </span>
            {isSearch ? (
              <svg
                className="h-4 w-4 shrink-0 text-text-tertiary"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                alt=""
                width={16}
                height={16}
                className="shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="truncate text-xs text-text-secondary">
              {isSearch ? "Web search" : domain}
            </span>
            <SourceQualityBadges source={s} />
            <span
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${reliabilityDot}`}
              title={`${s.reliability} reliability`}
            />
          </>
        );

        const pillClasses =
          "flex items-center gap-1.5 rounded-full border border-border-default bg-surface-raised px-2.5 py-1 transition-colors hover:border-border-focus hover:bg-surface-overlay";

        if (onSourceClick) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSourceClick(i + 1)}
              className={pillClasses}
            >
              {pillContent}
            </button>
          );
        }

        return href ? (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={pillClasses}
          >
            {pillContent}
          </a>
        ) : (
          <span
            key={i}
            className="flex items-center gap-1.5 rounded-full border border-border-default bg-surface-raised px-2.5 py-1"
          >
            {pillContent}
          </span>
        );
      })}
    </div>
  );
}
