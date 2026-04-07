"use client";

import { Project, EpcDiscovery, ScrapeRun } from "@/lib/types";

interface StatsCardsProps {
  projects: Project[];
  discoveries: EpcDiscovery[];
  lastRuns: ScrapeRun[];
}

export default function StatsCards({ projects, discoveries, lastRuns }: StatsCardsProps) {
  const total = projects.length;

  // Build a set of project IDs that have a non-rejected discovery
  const discoveredIds = new Set<string>();
  const confirmedIds = new Set<string>();
  const pendingIds = new Set<string>();

  for (const d of discoveries) {
    // Only count if the project is in current filtered set
    if (!projects.some((p) => p.id === d.project_id)) continue;
    if (discoveredIds.has(d.project_id)) continue; // first = latest

    discoveredIds.add(d.project_id);
    if (d.review_status === "accepted") confirmedIds.add(d.project_id);
    else if (d.review_status === "pending") pendingIds.add(d.project_id);
  }

  // Per-ISO last scrape
  const isoLastScrape: Record<string, Date> = {};
  for (const r of lastRuns) {
    const d = new Date(r.completed_at || r.started_at);
    if (!isoLastScrape[r.iso_region] || d > isoLastScrape[r.iso_region]) {
      isoLastScrape[r.iso_region] = d;
    }
  }

  function freshnessDot(date: Date): string {
    // eslint-disable-next-line react-hooks/purity
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 7) return "bg-status-green";
    if (days <= 14) return "bg-status-amber";
    return "bg-status-red";
  }

  const isoScrapes = Object.entries(isoLastScrape)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, date]) => ({ iso, date, dot: freshnessDot(date) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Projects" value={total.toLocaleString()} />
        <StatCard
          label="EPCs Found"
          value={confirmedIds.size.toLocaleString()}
          accent={confirmedIds.size > 0 ? "text-status-green" : undefined}
        />
        <StatCard
          label="Pending Review"
          value={pendingIds.size.toLocaleString()}
          accent={pendingIds.size > 0 ? "text-accent-amber" : undefined}
        />
        {/* Data Freshness card — per-ISO breakdown */}
        <div className="rounded-lg border border-border-subtle bg-surface-raised p-5">
          <p className="text-sm font-medium text-text-secondary">Data Freshness</p>
          <div className="mt-1.5 flex flex-col gap-1">
            {isoScrapes.length > 0 ? (
              isoScrapes.map(({ iso, date, dot }) => (
                <div key={iso} className="flex items-center gap-2 text-sm">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                  <span className="font-medium text-text-primary">{iso}</span>
                  <span className="text-text-tertiary">
                    {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-sm text-text-tertiary">No scrape data</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-raised p-5">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent || "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}
