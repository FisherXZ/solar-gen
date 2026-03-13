"use client";

import { useState, useCallback } from "react";
import { EpcSource, StructuredReasoning } from "@/lib/types";
import SourceCard from "./SourceCard";
import CitationTooltip from "./CitationTooltip";
import SourceRail from "./SourceRail";

/* ------------------------------------------------------------------ */
/*  Type guard                                                         */
/* ------------------------------------------------------------------ */

function isStructured(r: unknown): r is StructuredReasoning {
  return typeof r === "object" && r !== null && "summary" in r;
}

/* ------------------------------------------------------------------ */
/*  Citation badge                                                     */
/* ------------------------------------------------------------------ */

function CitationBadge({
  index,
  source,
  onClick,
}: {
  index: number;
  source?: EpcSource;
  onClick: () => void;
}) {
  const badge = (
    <button
      type="button"
      onClick={onClick}
      className="ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-accent-amber-muted px-1 align-super text-[10px] font-semibold text-accent-amber transition-colors hover:bg-accent-amber hover:text-surface-primary"
    >
      {index}
    </button>
  );

  if (source) {
    return (
      <CitationTooltip index={index} source={source}>
        {badge}
      </CitationTooltip>
    );
  }

  return badge;
}

/* ------------------------------------------------------------------ */
/*  Parse [N] citations in text, return mixed React nodes              */
/* ------------------------------------------------------------------ */

function renderWithCitations(
  text: string,
  onCitationClick: (index: number) => void,
  sources?: EpcSource[]
): React.ReactNode[] {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const source = sources?.[idx - 1];
      return (
        <CitationBadge
          key={i}
          index={idx}
          source={source}
          onClick={() => onCitationClick(idx)}
        />
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/* ------------------------------------------------------------------ */
/*  Legacy: split reasoning into readable paragraphs / bullet points   */
/* ------------------------------------------------------------------ */

function formatReasoning(
  raw: string
):
  | { type: "paragraphs"; items: string[] }
  | { type: "numbered"; intro: string; items: string[] } {
  const trimmed = raw.trim();

  // Detect numbered points: "1) ...", "1. ...", "2) ..." etc.
  const numberedPattern = /(?:^|\s)(\d+)[).]\s/;
  if (numberedPattern.test(trimmed)) {
    const parts = trimmed.split(/(?:^|\s)(?=\d+[).]\s)/);
    const intro = parts[0]?.replace(/[:]\s*$/, "").trim() || "";
    const items = parts
      .slice(intro ? 1 : 0)
      .map((p) => p.replace(/^\d+[).]\s*/, "").trim())
      .filter(Boolean);

    if (items.length >= 2) {
      return { type: "numbered", intro, items };
    }
  }

  // Detect markdown-style bullet points: "- ..." or "* ..."
  if (/(?:^|\n)\s*[-*]\s/.test(trimmed)) {
    const parts = trimmed.split(/\n\s*[-*]\s/);
    const intro = parts[0]?.trim() || "";
    const items = parts
      .slice(1)
      .map((p) => p.trim())
      .filter(Boolean);
    if (items.length >= 2) {
      return { type: "numbered", intro, items };
    }
  }

  // Fallback: split into sentence-based paragraphs for readability
  const sentences = trimmed
    .replace(/\n+/g, " ")
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 3) {
    return { type: "paragraphs", items: [trimmed.replace(/\n+/g, " ")] };
  }

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paragraphs.push(sentences.slice(i, i + 3).join(" "));
  }
  return { type: "paragraphs", items: paragraphs };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ReasoningCard({
  reasoning,
  sources,
}: {
  reasoning: string | StructuredReasoning | null;
  sources: EpcSource[];
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [highlightedSource, setHighlightedSource] = useState<number | null>(
    null
  );

  const handleCitationClick = useCallback(
    (index: number) => {
      setSourcesOpen(true);
      setHighlightedSource(index);
      // Clear highlight after a delay
      setTimeout(() => setHighlightedSource(null), 2000);
    },
    []
  );

  if (!reasoning && sources.length === 0) return null;

  const structured = isStructured(reasoning) ? reasoning : null;
  const legacyFormatted =
    !structured && typeof reasoning === "string" && reasoning
      ? formatReasoning(reasoning)
      : null;

  return (
    <div className="max-w-2xl overflow-hidden rounded-lg border border-border-subtle bg-surface-raised">
      {/* Header */}
      <div className="border-b border-border-subtle bg-surface-overlay px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-amber-muted">
            <svg
              className="h-3.5 w-3.5 text-accent-amber"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
              />
            </svg>
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            Research Analysis
          </p>
        </div>
      </div>

      {/* Structured reasoning (new discoveries) */}
      {structured && (
        <div className="space-y-4 p-4">
          {/* Source Rail — Perplexity-style pills above the answer */}
          {sources.length > 0 && (
            <SourceRail sources={sources} onSourceClick={handleCitationClick} />
          )}

          {/* Summary */}
          <p className="text-[15px] leading-relaxed text-text-primary">
            {renderWithCitations(structured.summary, handleCitationClick, sources)}
          </p>

          {/* Supporting Evidence */}
          {structured.supporting_evidence.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Supporting Evidence
              </p>
              <ol className="space-y-2 pl-1">
                {structured.supporting_evidence.map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-2.5 text-sm leading-relaxed text-text-secondary"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-amber-muted text-xs font-semibold text-accent-amber">
                      {i + 1}
                    </span>
                    <span>
                      {renderWithCitations(item, handleCitationClick, sources)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Gaps & Uncertainties */}
          {structured.gaps.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  Gaps & Uncertainties
                </p>
              </div>
              <ul className="space-y-1.5 pl-1">
                {structured.gaps.map((gap, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm leading-relaxed text-text-tertiary"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-tertiary" />
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Legacy reasoning (old string discoveries) */}
      {legacyFormatted && (
        <div className="p-4">
          {legacyFormatted.type === "numbered" ? (
            <div className="space-y-3">
              {legacyFormatted.intro && (
                <p className="text-sm leading-relaxed text-text-secondary">
                  {legacyFormatted.intro}
                </p>
              )}
              <ol className="space-y-2 pl-1">
                {legacyFormatted.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-2.5 text-sm leading-relaxed text-text-secondary"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-amber-muted text-xs font-semibold text-accent-amber">
                      {i + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="space-y-3">
              {legacyFormatted.items.map((para, i) => (
                <p
                  key={i}
                  className="text-sm leading-relaxed text-text-secondary"
                >
                  {para}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sources — collapsible */}
      {sources.length > 0 && (
        <div className="border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-overlay"
          >
            <svg
              className="h-4 w-4 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
              />
            </svg>
            <span className="flex-1 text-sm font-medium text-text-primary">
              Sources ({sources.length})
            </span>
            <svg
              className={`h-4 w-4 text-text-tertiary transition-transform duration-200 ${sourcesOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
          {sourcesOpen && (
            <div className="flex flex-col gap-2 px-4 pb-4">
              {sources.map((source, i) => (
                <div
                  key={i}
                  className={`rounded transition-colors duration-500 ${
                    highlightedSource === i + 1
                      ? "ring-1 ring-accent-amber bg-accent-amber-muted"
                      : ""
                  }`}
                >
                  <SourceCard source={source} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
