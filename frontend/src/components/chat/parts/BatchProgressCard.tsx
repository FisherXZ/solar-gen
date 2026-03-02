"use client";

import ConfidenceBadge from "@/components/epc/ConfidenceBadge";

interface BatchResult {
  project_id: string;
  status: string;
  project_name?: string;
  discovery?: {
    epc_contractor: string;
    confidence: string;
  };
  reason?: string;
  error?: string;
}

interface BatchProgressCardProps {
  data: {
    results?: BatchResult[];
    total?: number;
    completed?: number;
    errors?: number;
  };
}

export default function BatchProgressCard({ data }: BatchProgressCardProps) {
  const results = data.results || [];
  const total = data.total || 0;
  const completed = data.completed || 0;
  const errors = data.errors || 0;

  return (
    <div className="my-2 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-900">
          Batch Research Results
        </span>
        <span className="text-xs text-slate-500">
          {completed} of {total} completed
          {errors > 0 && (
            <span className="ml-1 text-red-500">({errors} errors)</span>
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300"
          style={{
            width: `${total > 0 ? (completed / total) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Results list */}
      <div className="divide-y divide-slate-100">
        {results.map((r, i) => (
          <div key={r.project_id || i} className="flex items-center justify-between py-2">
            <span className="truncate text-sm text-slate-700">
              {r.project_name || r.project_id}
            </span>
            <div className="ml-2 shrink-0">
              {r.status === "completed" && r.discovery ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">
                    {r.discovery.epc_contractor}
                  </span>
                  <ConfidenceBadge confidence={r.discovery.confidence} />
                </div>
              ) : r.status === "skipped" ? (
                <span className="text-xs text-amber-500">Skipped</span>
              ) : r.status === "error" ? (
                <span className="text-xs text-red-500">Error</span>
              ) : r.status === "started" ? (
                <span className="text-xs text-blue-500">Researching...</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
