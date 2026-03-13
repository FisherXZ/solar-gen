"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { EpcSource } from "@/lib/types";
import SourceQualityBadges from "./SourceQualityBadges";

interface CitationTooltipProps {
  index: number;
  source: EpcSource;
  children: React.ReactNode;
}

function getDomain(url: string | null): string | null {
  if (!url || url.startsWith("search:")) return null;
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return null;
  }
}

export default function CitationTooltip({
  source,
  children,
}: CitationTooltipProps) {
  const domain = getDomain(source.url);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-border-subtle bg-surface-overlay p-3 shadow-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {/* Domain row with favicon */}
          <div className="mb-1.5 flex items-center gap-1.5">
            {domain ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
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
                <span className="text-xs text-text-tertiary">{domain}</span>
              </>
            ) : (
              <>
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
                <span className="text-xs text-text-tertiary">Web search</span>
              </>
            )}
          </div>

          {/* Excerpt */}
          {source.excerpt && (
            <p className="mb-2 text-sm leading-snug text-text-secondary line-clamp-3">
              &ldquo;{source.excerpt.slice(0, 120)}
              {source.excerpt.length > 120 ? "..." : ""}&rdquo;
            </p>
          )}

          {/* Quality badges */}
          <SourceQualityBadges source={source} />

          <Tooltip.Arrow className="fill-surface-overlay" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
