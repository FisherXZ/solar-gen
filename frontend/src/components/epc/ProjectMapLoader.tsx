"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Project, EpcDiscovery, Filters } from "@/lib/types";
import FilterBar from "@/components/FilterBar";

const ProjectMap = dynamic(() => import("./ProjectMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-220px)] min-h-[500px] items-center justify-center rounded-lg border border-border-subtle bg-surface-raised">
      <p className="text-text-tertiary">Loading map...</p>
    </div>
  ),
});

const DEFAULT_FILTERS: Filters = {
  iso_region: "",
  state: "",
  status: "",
  fuel_type: "",
  mw_min: 0,
  mw_max: 0,
  cod_year_min: 0,
  cod_year_max: 0,
  construction_status: "",
  search: "",
};

interface Props {
  projects: Project[];
  discoveries: EpcDiscovery[];
}

export default function ProjectMapLoader({ projects, discoveries }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const states = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) {
      if (p.state) set.add(p.state);
    }
    return Array.from(set).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    const searchLower = filters.search.toLowerCase();
    return projects.filter((p) => {
      if (filters.iso_region && p.iso_region !== filters.iso_region) return false;
      if (filters.state && (p.state || "").toLowerCase() !== filters.state.toLowerCase()) return false;
      if (filters.status && !(p.status || "").toLowerCase().includes(filters.status.toLowerCase())) return false;
      if (filters.fuel_type && !(p.fuel_type || "").toLowerCase().includes(filters.fuel_type.toLowerCase())) return false;
      if (filters.construction_status && (p.construction_status || "unknown") !== filters.construction_status) return false;
      if (filters.mw_min && (p.mw_capacity || 0) < filters.mw_min) return false;
      if (filters.mw_max && (p.mw_capacity || 0) > filters.mw_max) return false;
      if (filters.cod_year_min || filters.cod_year_max) {
        const codYear = p.expected_cod ? new Date(p.expected_cod).getFullYear() : null;
        if (!codYear) return false;
        if (filters.cod_year_min && codYear < filters.cod_year_min) return false;
        if (filters.cod_year_max && codYear > filters.cod_year_max) return false;
      }
      if (
        searchLower &&
        !(p.project_name || "").toLowerCase().includes(searchLower) &&
        !(p.developer || "").toLowerCase().includes(searchLower) &&
        !(p.epc_company || "").toLowerCase().includes(searchLower) &&
        !(p.county || "").toLowerCase().includes(searchLower) &&
        !(p.state || "").toLowerCase().includes(searchLower)
      )
        return false;
      return true;
    });
  }, [projects, filters]);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar filters={filters} onChange={setFilters} states={states} />
      <ProjectMap projects={filtered} discoveries={discoveries} />
    </div>
  );
}
