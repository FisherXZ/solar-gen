// frontend/src/components/briefing/NeedsInvestigationPanel.tsx
"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { agentFetch } from "@/lib/agent-fetch";

export interface UnresearchedProject {
  id: string;
  project_name: string;
  iso_region: string;
  state: string | null;
  lead_score: number;
}

interface ResearchQueueCardProps {
  projects: UnresearchedProject[];
  totalUnresearched: number;
}

interface BatchProgress {
  completed: number;
  total: number;
  currentName: string;
}

export default function NeedsInvestigationPanel({
  projects: initialProjects,
  totalUnresearched,
}: ResearchQueueCardProps) {
  const [projects] =
    useState<UnresearchedProject[]>(initialProjects);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const visibleProjects = projects.filter((p) => !completedIds.has(p.id));

  const handleResearchBatch = useCallback(async () => {
    const ids = visibleProjects.map((p) => p.id);
    if (ids.length === 0) return;

    setIsRunning(true);
    setError(null);
    setProgress({ completed: 0, total: ids.length, currentName: "" });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await agentFetch("/api/discover/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ids: ids }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setError(`Batch research failed (${res.status}).`);
        setIsRunning(false);
        setProgress(null);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("No response stream.");
        setIsRunning(false);
        setProgress(null);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "started") {
              setProgress({
                completed: event.completed,
                total: event.total,
                currentName: event.project_name || "",
              });
            } else if (
              event.type === "completed" ||
              event.type === "skipped" ||
              event.type === "error"
            ) {
              setProgress({
                completed: event.completed,
                total: event.total,
                currentName: "",
              });
              if (event.type === "completed") {
                setCompletedIds((prev) =>
                  new Set(prev).add(event.project_id)
                );
              }
            } else if (event.type === "done") {
              // stream finished
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // user cancelled
      } else {
        setError("Batch research failed. Check your connection.");
      }
    } finally {
      setIsRunning(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [visibleProjects]);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-raised">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
            Research Queue
          </h2>
          {totalUnresearched > 0 && (
            <span className="rounded-full bg-surface-overlay px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
              {totalUnresearched.toLocaleString()}
            </span>
          )}
        </div>
        <Link
          href="/projects"
          className="text-[10px] text-text-tertiary transition-colors hover:text-text-secondary"
        >
          View full pipeline →
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="border-b border-border-subtle px-4 py-2">
          <p className="text-xs text-status-red">{error}</p>
        </div>
      )}

      {/* Project list or progress */}
      <div className="divide-y divide-border-subtle">
        {isRunning && progress ? (
          <div className="px-4 py-6">
            <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
              <span>
                Researching {progress.completed} / {progress.total}
                {progress.currentName
                  ? ` · ${progress.currentName}`
                  : ""}
              </span>
              <button
                onClick={() => abortRef.current?.abort()}
                className="text-[10px] text-text-tertiary transition-colors hover:text-text-secondary"
              >
                Cancel
              </button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
              <div
                className="h-full rounded-full bg-accent-amber transition-all duration-500"
                style={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-text-tertiary">
              {completedIds.size > 0
                ? "Batch complete. Refresh to see the next 5."
                : "All projects have been researched."}
            </p>
          </div>
        ) : (
          visibleProjects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-overlay"
            >
              <div className="min-w-0 flex-1">
                <span className="font-serif text-[13px] text-text-primary">
                  {p.project_name || "Unnamed Project"}
                </span>
                <p className="mt-0.5 text-[10px] text-text-tertiary">
                  {p.iso_region}
                  {p.state ? ` · ${p.state}` : ""}
                </p>
              </div>
              <span className="ml-3 shrink-0 font-serif text-sm text-text-secondary">
                {p.lead_score}
              </span>
            </Link>
          ))
        )}
      </div>

      {/* Action button */}
      {!isRunning && visibleProjects.length > 0 && (
        <div className="border-t border-border-subtle px-4 py-3">
          <button
            onClick={handleResearchBatch}
            className="w-full rounded-md bg-accent-amber-muted py-2 text-xs font-medium text-accent-amber transition-colors hover:bg-accent-amber/25"
          >
            Research these {visibleProjects.length} →
          </button>
        </div>
      )}
    </div>
  );
}
