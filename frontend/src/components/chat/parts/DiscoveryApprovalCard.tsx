"use client";

import { useState } from "react";
import ConfidenceBadge from "../../epc/ConfidenceBadge";
import SourceCard from "../../epc/SourceCard";
import SourceRail from "../../epc/SourceRail";
import { EpcSource } from "@/lib/types";

interface DiscoveryApprovalCardProps {
  data: {
    discovery_id?: string;
    epc_contractor?: string;
    confidence?: string;
    sources?: EpcSource[];
    source_summary?: string[];
    assessment?: string;
    awaiting_review?: boolean;
    status?: string;
    message?: string;
    error?: string;
  };
}

export default function DiscoveryApprovalCard({
  data,
}: DiscoveryApprovalCardProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  if (data.error) {
    return (
      <div className="rounded-lg badge-red border border-status-red/20 p-4 text-sm">
        Review error: {data.error}
      </div>
    );
  }

  function handleOption(text: string) {
    window.dispatchEvent(
      new CustomEvent("populate-chat-input", { detail: { text } })
    );
  }

  const isUnknown =
    !data.epc_contractor || data.epc_contractor === "Unknown";
  const sources = data.sources || [];
  const isAccepted = data.status === "accepted";
  const isRejected = data.status === "rejected";
  const hasDecision = isAccepted || isRejected;

  // Left border + background based on state
  const borderClass = isAccepted
    ? "border-l-4 border-l-status-green bg-status-green/5"
    : isRejected
      ? "border-l-4 border-l-status-red bg-status-red/5 opacity-75"
      : "border-l-4 border-l-status-amber";

  return (
    <div className={`rounded-lg border border-border-subtle p-4 ${borderClass}`}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">
            {isUnknown
              ? "EPC Not Found — Review Required"
              : data.epc_contractor}
          </h4>
        </div>
        {data.confidence && (
          <ConfidenceBadge
            confidence={data.confidence}
            sourceCount={sources.length || undefined}
            size="sm"
          />
        )}
      </div>

      {/* Source Rail — Perplexity-style pills */}
      {sources.length > 0 && (
        <div className="mb-3">
          <SourceRail sources={sources} />
        </div>
      )}

      {/* Legacy fallback: source_summary as plain text */}
      {sources.length === 0 && data.source_summary && data.source_summary.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            Sources ({data.source_summary.length})
          </p>
          <ul className="space-y-0.5">
            {data.source_summary.map((s, i) => (
              <li key={i} className="text-sm text-text-secondary">
                &bull; {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Assessment */}
      {data.assessment && (
        <div className="mb-3 rounded-md bg-surface-overlay/60 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            Assessment
          </p>
          <p className="mt-0.5 text-sm text-text-secondary">{data.assessment}</p>
        </div>
      )}

      {/* Expandable full sources */}
      {sources.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="flex items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${sourcesOpen ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            View full sources ({sources.length})
          </button>
          {sourcesOpen && (
            <div className="mt-2 space-y-2">
              {sources.map((s, i) => (
                <SourceCard key={i} source={s} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Post-action status badge */}
      {hasDecision && (
        <div className="mb-2">
          {isAccepted && (
            <span className="inline-block badge-green rounded-full px-2.5 py-0.5 text-xs font-semibold">
              Confirmed
            </span>
          )}
          {isRejected && (
            <span className="inline-block badge-red rounded-full px-2.5 py-0.5 text-xs font-semibold">
              Rejected
            </span>
          )}
        </div>
      )}

      {/* Action buttons — only show if awaiting review and no decision yet */}
      {data.awaiting_review && !hasDecision && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleOption("Accept this finding")}
            className="rounded-md bg-status-green px-3 py-1.5 text-xs font-medium text-surface-primary transition-colors hover:bg-status-green/90"
          >
            Accept
          </button>
          <button
            onClick={() => handleOption("Reject — ")}
            className="rounded-md border border-status-red/30 px-3 py-1.5 text-xs font-medium text-status-red transition-colors hover:bg-status-red/10"
          >
            Reject
          </button>
          <button
            onClick={() => handleOption("Keep researching")}
            className="rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-overlay"
          >
            Keep Researching
          </button>
        </div>
      )}
    </div>
  );
}
