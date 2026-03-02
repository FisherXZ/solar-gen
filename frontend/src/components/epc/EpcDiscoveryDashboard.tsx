"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Project, EpcDiscovery, EpcFilter } from "@/lib/types";
import ProjectPicker from "./ProjectPicker";
import ResearchPanel from "./ResearchPanel";

interface EpcDiscoveryDashboardProps {
  projects: Project[];
  discoveries: EpcDiscovery[];
}

interface BatchProgress {
  completed: number;
  total: number;
  currentProject: string;
}

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

const FILTER_TABS: { key: EpcFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_research", label: "Needs Research" },
  { key: "has_epc", label: "Has EPC" },
  { key: "pending_review", label: "Pending Review" },
];

export default function EpcDiscoveryDashboard({
  projects,
  discoveries: initialDiscoveries,
}: EpcDiscoveryDashboardProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [discoveries, setDiscoveries] =
    useState<EpcDiscovery[]>(initialDiscoveries);
  const [activeFilter, setActiveFilter] = useState<EpcFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isResearching, setIsResearching] = useState(false);

  // Batch state
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);

  // Stats
  const stats = useMemo(() => {
    const projectIds = new Set(projects.map((p) => p.id));
    const discoveryMap = new Map<string, EpcDiscovery>();
    for (const d of discoveries) {
      if (projectIds.has(d.project_id)) {
        // Keep only the latest discovery per project (already sorted desc)
        if (!discoveryMap.has(d.project_id)) {
          discoveryMap.set(d.project_id, d);
        }
      }
    }

    let researched = 0;
    let confirmed = 0;
    let pendingReview = 0;

    for (const d of discoveryMap.values()) {
      researched++;
      if (d.review_status === "accepted") confirmed++;
      if (d.review_status === "pending") pendingReview++;
    }

    return {
      total: projects.length,
      researched,
      confirmed,
      pendingReview,
    };
  }, [projects, discoveries]);

  // Find discovery for selected project
  const selectedDiscovery = useMemo(() => {
    if (!selectedProject) return null;
    return (
      discoveries.find((d) => d.project_id === selectedProject.id) || null
    );
  }, [selectedProject, discoveries]);

  // Checkbox handlers
  const handleToggleCheck = useCallback((projectId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(
    (filteredIds: string[]) => {
      const allChecked = filteredIds.every((id) => checkedIds.has(id));
      if (allChecked) {
        // Uncheck all filtered
        setCheckedIds((prev) => {
          const next = new Set(prev);
          for (const id of filteredIds) next.delete(id);
          return next;
        });
      } else {
        // Check all filtered
        setCheckedIds((prev) => {
          const next = new Set(prev);
          for (const id of filteredIds) next.add(id);
          return next;
        });
      }
    },
    [checkedIds]
  );

  // Single research
  async function handleResearch(projectId: string) {
    setIsResearching(true);
    try {
      const res = await fetch(`${AGENT_API_URL}/api/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed with status ${res.status}`);
      }

      const newDiscovery: EpcDiscovery = await res.json();
      setDiscoveries((prev) => [newDiscovery, ...prev]);

      // Select the project that was researched
      const project = projects.find((p) => p.id === projectId);
      if (project) setSelectedProject(project);
    } catch (err) {
      console.error("Research failed:", err);
      alert(
        `Research failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsResearching(false);
    }
  }

  // Batch research via SSE
  async function handleBatchResearch() {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;

    const abort = new AbortController();
    abortRef.current = abort;
    setBatchProgress({ completed: 0, total: ids.length, currentProject: "" });
    setIsResearching(true);

    try {
      const res = await fetch(`${AGENT_API_URL}/api/discover/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ids: ids }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Batch request failed: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "started") {
              setBatchProgress({
                completed: event.completed,
                total: event.total,
                currentProject: event.project_name || "",
              });
            } else if (event.type === "completed") {
              setBatchProgress({
                completed: event.completed,
                total: event.total,
                currentProject: "",
              });
              if (event.discovery) {
                setDiscoveries((prev) => [event.discovery, ...prev]);
              }
            } else if (
              event.type === "skipped" ||
              event.type === "error"
            ) {
              setBatchProgress({
                completed: event.completed,
                total: event.total,
                currentProject: "",
              });
            } else if (event.type === "done") {
              // finished
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      setCheckedIds(new Set());
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Batch research failed:", err);
        alert(
          `Batch failed: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    } finally {
      setIsResearching(false);
      setBatchProgress(null);
      abortRef.current = null;
    }
  }

  // Review handler
  async function handleReview(
    discoveryId: string,
    action: "accepted" | "rejected"
  ) {
    try {
      const res = await fetch(
        `${AGENT_API_URL}/api/discover/${discoveryId}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed with status ${res.status}`);
      }

      // Update local state
      setDiscoveries((prev) =>
        prev.map((d) =>
          d.id === discoveryId ? { ...d, review_status: action } : d
        )
      );

      // If accepted, update the project's epc_company locally
      if (action === "accepted") {
        const discovery = discoveries.find((d) => d.id === discoveryId);
        if (discovery) {
          const project = projects.find(
            (p) => p.id === discovery.project_id
          );
          if (project) {
            project.epc_company = discovery.epc_contractor;
          }
        }
      }
    } catch (err) {
      console.error("Review failed:", err);
      alert(
        `Review failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Total Projects</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {stats.total.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Researched</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {stats.researched.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Confirmed EPCs</p>
          <p className="mt-1 text-lg font-semibold text-emerald-600">
            {stats.confirmed.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Pending Review</p>
          <p className="mt-1 text-lg font-semibold text-amber-600">
            {stats.pendingReview.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filter tabs + search + batch action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeFilter === tab.key
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {checkedIds.size > 0 && (
            <button
              onClick={handleBatchResearch}
              disabled={isResearching}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              Research Selected ({checkedIds.size})
            </button>
          )}
          <input
            type="text"
            placeholder="Search projects..."
            className="h-9 w-64 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Batch progress bar */}
      {batchProgress && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-blue-900">
              Batch Research: {batchProgress.completed}/{batchProgress.total}
            </span>
            {batchProgress.currentProject && (
              <span className="text-blue-600">
                Researching: {batchProgress.currentProject}
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{
                width: `${
                  batchProgress.total > 0
                    ? (batchProgress.completed / batchProgress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex gap-6">
        <div className="flex-[3]">
          <ProjectPicker
            projects={projects}
            discoveries={discoveries}
            selectedProject={selectedProject}
            onSelect={setSelectedProject}
            onResearch={handleResearch}
            isResearching={isResearching}
            activeFilter={activeFilter}
            searchQuery={searchQuery}
            checkedIds={checkedIds}
            onToggleCheck={handleToggleCheck}
            onToggleAll={handleToggleAll}
          />
        </div>
        <div className="flex-[2]">
          <ResearchPanel
            project={selectedProject}
            discovery={selectedDiscovery}
            onReview={handleReview}
          />
        </div>
      </div>
    </div>
  );
}
