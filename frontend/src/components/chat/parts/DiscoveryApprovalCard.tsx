"use client";

import ConfidenceBadge from "../../epc/ConfidenceBadge";

interface DiscoveryApprovalCardProps {
  data: {
    discovery_id?: string;
    epc_contractor?: string;
    confidence?: string;
    source_summary?: string[];
    assessment?: string;
    awaiting_review?: boolean;
    // After approval/rejection
    status?: string;
    message?: string;
    error?: string;
  };
}

export default function DiscoveryApprovalCard({
  data,
}: DiscoveryApprovalCardProps) {
  if (data.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
          <svg
            className="h-4 w-4 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            {isUnknown
              ? "EPC Not Found — Review Required"
              : `EPC Discovery: ${data.epc_contractor}`}
          </h4>
          {data.confidence && (
            <ConfidenceBadge confidence={data.confidence} size="sm" />
          )}
        </div>
      </div>

      {/* Sources */}
      {data.source_summary && data.source_summary.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            Sources ({data.source_summary.length})
          </p>
          <ul className="space-y-0.5">
            {data.source_summary.map((s, i) => (
              <li key={i} className="text-sm text-slate-600">
                &bull; {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Assessment */}
      {data.assessment && (
        <div className="mb-3 rounded-md bg-white/60 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Assessment
          </p>
          <p className="mt-0.5 text-sm text-slate-700">{data.assessment}</p>
        </div>
      )}

      {/* Action buttons — only show if awaiting review */}
      {data.awaiting_review && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleOption("Accept this finding")}
            className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            Accept
          </button>
          <button
            onClick={() => handleOption("Reject — ")}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
          >
            Reject
          </button>
          <button
            onClick={() => handleOption("Keep researching")}
            className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50"
          >
            Keep Researching
          </button>
        </div>
      )}
    </div>
  );
}
