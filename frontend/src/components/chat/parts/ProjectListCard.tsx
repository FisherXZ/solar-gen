"use client";

import { useState } from "react";

interface ProjectRow {
  id: string;
  project_name: string | null;
  developer: string | null;
  mw_capacity: number | null;
  state: string | null;
  iso_region: string;
  epc_company: string | null;
  fuel_type: string | null;
  lead_score?: number | null;
}

interface ProjectListCardProps {
  data: {
    projects?: ProjectRow[];
    count?: number;
  };
}

const PREVIEW_COUNT = 5;

export default function ProjectListCard({ data }: ProjectListCardProps) {
  const projects = (data.projects || []) as ProjectRow[];
  const [expanded, setExpanded] = useState(false);

  if (projects.length === 0) {
    return (
      <div className="rounded-lg p-4 text-sm text-text-tertiary">
        No projects found matching your criteria.
      </div>
    );
  }

  const hasMore = projects.length > PREVIEW_COUNT;
  const visible = expanded ? projects : projects.slice(0, PREVIEW_COUNT);

  return (
    <div className="overflow-hidden bg-surface-raised">
      <div className="border-b border-border-subtle bg-surface-overlay px-4 py-2">
        <span className="text-xs font-medium text-text-secondary">
          {data.count ?? projects.length} project{projects.length !== 1 ? "s" : ""} found
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {visible.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-text-primary">
                  {p.project_name || p.id}
                </span>
                {p.mw_capacity && (
                  <span className="shrink-0 text-xs text-text-tertiary">
                    {p.mw_capacity} MW
                  </span>
                )}
                {p.lead_score != null && (
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    p.lead_score >= 70
                      ? "badge-green"
                      : p.lead_score >= 40
                        ? "badge-amber"
                        : "badge-neutral"
                  }`}>
                    {p.lead_score}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                {p.developer && <span>{p.developer}</span>}
                {p.state && <span>&middot; {p.state}</span>}
                {p.iso_region && <span>&middot; {p.iso_region}</span>}
                {p.fuel_type && <span>&middot; {p.fuel_type}</span>}
              </div>
            </div>
            <div className="ml-3 shrink-0">
              {p.epc_company ? (
                <span className="text-xs text-status-green">{p.epc_company}</span>
              ) : (
                <span className="badge-neutral rounded-full px-2 py-0.5 text-xs">
                  No EPC
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-border-subtle px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          {expanded
            ? "Show less"
            : `Show all ${projects.length} projects`}
        </button>
      )}
    </div>
  );
}
