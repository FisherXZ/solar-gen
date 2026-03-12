"use client";

import { useEffect, useState, useRef } from "react";
import ConfidenceBadge from "@/components/epc/ConfidenceBadge";

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectStatus {
  project_id: string;
  project_name: string;
  status: "waiting" | "researching" | "completed" | "skipped" | "error" | "cancelled";
  epc_contractor?: string;
  confidence?: string;
  error?: string;
}

interface BatchSnapshot {
  batch_id: string;
  total: number;
  completed: number;
  errors: number;
  done: boolean;
  cancelled?: boolean;
  projects: ProjectStatus[];
}

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
    _batch_id?: string;
    _project_names?: Record<string, string>;
  };
  isLive?: boolean;
  input?: Record<string, unknown>;
  onStatusChange?: (status: "running" | "done" | "cancelled") => void;
}

// ---------------------------------------------------------------------------
// Log entry type
// ---------------------------------------------------------------------------

interface LogEntry {
  project_id: string;
  project_name: string;
  status: "researching" | "completed" | "skipped" | "error" | "cancelled";
  epc_contractor?: string;
  confidence?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Log line component
// ---------------------------------------------------------------------------

function LogLine({ entry }: { entry: LogEntry }) {
  switch (entry.status) {
    case "researching":
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-accent-amber-muted border-t-accent-amber" />
          </span>
          <span className="truncate text-text-tertiary">
            Researching {entry.project_name}...
          </span>
        </div>
      );
    case "completed":
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 text-status-green">&#10003;</span>
          <span className="truncate text-text-secondary">
            {entry.project_name}
          </span>
          {entry.epc_contractor && (
            <>
              <span className="shrink-0 text-text-tertiary">&rarr;</span>
              <span className="truncate font-medium text-text-primary">
                {entry.epc_contractor}
              </span>
              {entry.confidence && (
                <ConfidenceBadge confidence={entry.confidence} />
              )}
            </>
          )}
          {!entry.epc_contractor && (
            <span className="text-text-tertiary">— no EPC found</span>
          )}
        </div>
      );
    case "skipped":
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 text-text-tertiary">&mdash;</span>
          <span className="truncate text-text-tertiary">
            {entry.project_name} — skipped
          </span>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 text-status-red">&#10007;</span>
          <span className="truncate text-text-tertiary">
            {entry.project_name} — {entry.error || "error"}
          </span>
        </div>
      );
    case "cancelled":
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 text-text-tertiary">&mdash;</span>
          <span className="truncate text-text-tertiary">
            {entry.project_name} — stopped
          </span>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BatchProgressCard({
  data,
  isLive = false,
  input,
  onStatusChange,
}: BatchProgressCardProps) {
  // Determine batch_id from input (during call state) or data (during result)
  const batchId =
    (input?._batch_id as string) || data._batch_id || null;

  const [liveProjects, setLiveProjects] = useState<ProjectStatus[] | null>(
    null
  );
  const [liveDone, setLiveDone] = useState(false);
  const [liveCancelled, setLiveCancelled] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to live progress when in live mode
  useEffect(() => {
    if (!isLive || !batchId || liveDone) return;

    const url = `${AGENT_API_URL}/api/batch-progress/${batchId}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const snapshot: BatchSnapshot = JSON.parse(event.data);
        setLiveProjects(snapshot.projects);
        if (snapshot.cancelled) setLiveCancelled(true);
        if (snapshot.done) {
          setLiveDone(true);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setLiveDone(true);
      es.close();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isLive, batchId, liveDone]);

  // Notify parent of status changes
  useEffect(() => {
    if (liveCancelled) onStatusChange?.("cancelled");
    else if (liveDone) onStatusChange?.("done");
  }, [liveDone, liveCancelled, onStatusChange]);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveProjects]);

  // Build project list from the best available source
  let projects: ProjectStatus[];
  let total: number;
  let completedCount: number;
  let errorCount: number;

  if (liveProjects) {
    projects = liveProjects;
    total = projects.length;
    completedCount = projects.filter(
      (p) => p.status === "completed" || p.status === "skipped" || p.status === "error" || p.status === "cancelled"
    ).length;
    errorCount = projects.filter((p) => p.status === "error").length;
  } else if (data.results && data.results.length > 0) {
    projects = data.results.map((r) => ({
      project_id: r.project_id,
      project_name: r.project_name || r.project_id,
      status: (r.status === "started" ? "researching" : r.status) as ProjectStatus["status"],
      epc_contractor: r.discovery?.epc_contractor,
      confidence: r.discovery?.confidence,
      error: r.error,
    }));
    total = data.total || projects.length;
    completedCount = data.completed || 0;
    errorCount = data.errors || 0;
  } else if (input?._project_names) {
    const names = input._project_names as Record<string, string>;
    const ids = (input?.project_ids as string[]) || Object.keys(names);
    projects = ids.map((id) => ({
      project_id: id,
      project_name: names[id] || id,
      status: "waiting" as const,
    }));
    total = projects.length;
    completedCount = 0;
    errorCount = 0;
  } else {
    return null;
  }

  const progressPct = total > 0 ? (completedCount / total) * 100 : 0;
  const isDone = (completedCount === total && total > 0) || liveCancelled;
  const isCancelled = liveCancelled || (data as Record<string, unknown>)?.cancelled === true;

  // Build log entries: only non-waiting projects, ordered by status progression
  const logEntries: LogEntry[] = projects
    .filter((p): p is ProjectStatus & { status: LogEntry["status"] } => p.status !== "waiting")
    .map((p) => ({
      project_id: p.project_id,
      project_name: p.project_name,
      status: p.status,
      epc_contractor: p.epc_contractor,
      confidence: p.confidence,
      error: p.error,
    }));

  const cancelledCount = projects.filter((p) => p.status === "cancelled").length;

  // Summary stats for completed state
  const foundCount = projects.filter(
    (p) => p.status === "completed" && p.epc_contractor
  ).length;
  const unknownCount = projects.filter(
    (p) => p.status === "completed" && !p.epc_contractor
  ).length;
  const skippedCount = projects.filter((p) => p.status === "skipped").length;

  return (
    <div className="px-4 py-3">
      {/* Progress bar + counter */}
      <div className="mb-2 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-overlay">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isDone
                ? isCancelled || errorCount > 0
                  ? "bg-status-amber"
                  : "bg-status-green"
                : "bg-accent-amber"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-text-secondary">
          {completedCount} / {total}
        </span>
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <p className="mb-2 text-xs text-text-tertiary">
          Batch stopped by user
        </p>
      )}

      {/* Summary stats (when done) */}
      {isDone && (
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-text-secondary">
          {foundCount > 0 && (
            <span>
              <span className="text-status-green">{foundCount}</span> found
            </span>
          )}
          {unknownCount > 0 && (
            <span>
              <span className="text-text-tertiary">{unknownCount}</span> unknown
            </span>
          )}
          {skippedCount > 0 && (
            <span>
              <span className="text-text-tertiary">{skippedCount}</span> skipped
            </span>
          )}
          {cancelledCount > 0 && (
            <span>
              <span className="text-text-tertiary">{cancelledCount}</span> stopped
            </span>
          )}
          {errorCount > 0 && (
            <span>
              <span className="text-status-red">{errorCount}</span> error{errorCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Scrolling log */}
      {logEntries.length > 0 && (
        <div className="relative">
          {/* Fade-out mask at top when scrollable */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-surface-raised to-transparent" />
          <div className="max-h-[240px] space-y-1 overflow-y-auto py-1 font-mono">
            {logEntries.map((entry) => (
              <LogLine key={entry.project_id} entry={entry} />
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Waiting state — no log entries yet */}
      {logEntries.length === 0 && total > 0 && (
        <p className="text-xs text-text-tertiary">
          Waiting for first result...
        </p>
      )}
    </div>
  );
}
