"use client";

import { Project, EpcDiscovery, EpcFilter } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";

interface ProjectPickerProps {
  projects: Project[];
  discoveries: EpcDiscovery[];
  selectedProject: Project | null;
  onSelect: (p: Project) => void;
  onResearch: (projectId: string) => void;
  isResearching: boolean;
  activeFilter: EpcFilter;
  searchQuery: string;
  checkedIds: Set<string>;
  onToggleCheck: (projectId: string) => void;
  onToggleAll: (projectIds: string[]) => void;
}

function getDiscoveryForProject(
  projectId: string,
  discoveries: EpcDiscovery[]
): EpcDiscovery | undefined {
  return discoveries.find((d) => d.project_id === projectId);
}

export default function ProjectPicker({
  projects,
  discoveries,
  selectedProject,
  onSelect,
  onResearch,
  isResearching,
  activeFilter,
  searchQuery,
  checkedIds,
  onToggleCheck,
  onToggleAll,
}: ProjectPickerProps) {
  // Filter projects based on active filter and search query
  const filteredProjects = projects.filter((project) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = (project.project_name || "")
        .toLowerCase()
        .includes(q);
      const matchesDeveloper = (project.developer || "")
        .toLowerCase()
        .includes(q);
      const matchesQueueId = project.queue_id.toLowerCase().includes(q);
      if (!matchesName && !matchesDeveloper && !matchesQueueId) return false;
    }

    // EPC filter
    const discovery = getDiscoveryForProject(project.id, discoveries);

    switch (activeFilter) {
      case "needs_research":
        return !discovery || discovery.review_status === "rejected";
      case "has_epc":
        return discovery?.review_status === "accepted";
      case "pending_review":
        return discovery?.review_status === "pending";
      case "all":
      default:
        return true;
    }
  });

  const filteredIds = filteredProjects.map((p) => p.id);
  const allChecked =
    filteredProjects.length > 0 &&
    filteredProjects.every((p) => checkedIds.has(p.id));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Select-all header */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={() => onToggleAll(filteredIds)}
          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-xs text-slate-500">
          {checkedIds.size > 0
            ? `${checkedIds.size} selected`
            : `${filteredProjects.length} projects`}
        </span>
      </div>

      <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
        {filteredProjects.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-400">
            No projects match the current filters.
          </div>
        ) : (
          filteredProjects.map((project) => {
            const discovery = getDiscoveryForProject(project.id, discoveries);
            const isSelected = selectedProject?.id === project.id;
            const isChecked = checkedIds.has(project.id);

            return (
              <div
                key={project.id}
                onClick={() => onSelect(project)}
                className={`flex cursor-pointer items-center justify-between border-b border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50 ${
                  isSelected ? "bg-blue-50 hover:bg-blue-50" : ""
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isChecked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleCheck(project.id)}
                  className="mr-3 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {project.project_name || project.queue_id}
                    </span>
                    {project.mw_capacity && (
                      <span className="shrink-0 text-xs text-slate-400">
                        {project.mw_capacity} MW
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    {project.developer && (
                      <span className="truncate">{project.developer}</span>
                    )}
                    {project.state && (
                      <span className="shrink-0">{project.state}</span>
                    )}
                  </div>
                </div>

                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {/* EPC status */}
                  {discovery ? (
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[120px] truncate text-xs font-medium text-slate-700">
                        {discovery.epc_contractor}
                      </span>
                      <ConfidenceBadge confidence={discovery.confidence} />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">No EPC</span>
                  )}

                  {/* Research button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onResearch(project.id);
                    }}
                    disabled={isResearching}
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    {isResearching ? (
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-3 w-3 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        <span>...</span>
                      </span>
                    ) : (
                      "Research"
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
