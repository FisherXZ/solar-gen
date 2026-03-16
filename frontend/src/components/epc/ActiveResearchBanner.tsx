"use client";

import { Project } from "@/lib/types";
import { useActiveResearch } from "@/lib/useActiveResearch";

interface ActiveResearchBannerProps {
  projects: Project[];
  onScrollToProject: (projectId: string) => void;
}

export default function ActiveResearchBanner({
  projects,
  onScrollToProject,
}: ActiveResearchBannerProps) {
  const entries = useActiveResearch();

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-accent-amber/20 bg-accent-amber-muted px-4 py-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-accent-amber">
        Active Research
      </p>
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => {
          const project = projects.find((p) => p.id === entry.projectId);
          const label = project
            ? project.project_name || project.queue_id
            : entry.projectId;

          return (
            <button
              key={entry.projectId}
              onClick={() => onScrollToProject(entry.projectId)}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-amber/30 bg-surface-raised px-3 py-1 text-xs font-medium text-text-primary transition-colors hover:border-accent-amber/50 hover:bg-surface-overlay"
            >
              {entry.status === "plan_ready" ? (
                <span className="h-1.5 w-1.5 rounded-full bg-accent-amber" />
              ) : (
                <svg
                  className="h-3 w-3 animate-spin text-accent-amber"
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
              )}
              <span className="max-w-[200px] truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
