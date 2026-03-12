"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Project, EpcDiscovery } from "@/lib/types";

interface ProjectMapProps {
  projects: Project[];
  discoveries: EpcDiscovery[];
}

// Build a lookup: project_id → latest discovery
function buildDiscoveryMap(discoveries: EpcDiscovery[]) {
  const map = new Map<string, EpcDiscovery>();
  for (const d of discoveries) {
    if (!map.has(d.project_id)) {
      map.set(d.project_id, d);
    }
  }
  return map;
}

function getMarkerColor(project: Project, discovery: EpcDiscovery | undefined): string {
  if (discovery && discovery.epc_contractor !== "Unknown") {
    switch (discovery.confidence) {
      case "confirmed": return "#5CB77A"; // status-green
      case "likely":    return "#5CB77A";
      case "possible":  return "#E8A230"; // accent-amber
      default:          return "#94a3b8"; // slate-400
    }
  }
  if (project.epc_company) {
    return "#5CB77A"; // status-green
  }
  return "#94a3b8"; // slate-400 — no EPC yet
}

function getMarkerRadius(mw: number | null): number {
  if (!mw) return 4;
  if (mw >= 500) return 12;
  if (mw >= 200) return 9;
  if (mw >= 100) return 7;
  if (mw >= 50)  return 5;
  return 4;
}

export default function ProjectMap({ projects, discoveries }: ProjectMapProps) {
  const discoveryMap = useMemo(() => buildDiscoveryMap(discoveries), [discoveries]);

  const mappable = useMemo(
    () => projects.filter((p) => p.latitude != null && p.longitude != null),
    [projects]
  );

  const stats = useMemo(() => {
    const withEpc = mappable.filter(
      (p) => p.epc_company || discoveryMap.has(p.id)
    ).length;
    return { total: mappable.length, withEpc, withoutEpc: mappable.length - withEpc };
  }, [mappable, discoveryMap]);

  // US center
  const center: [number, number] = [39.0, -98.0];

  return (
    <div className="flex flex-col gap-4">
      {/* Legend + stats */}
      <div className="flex flex-wrap items-center gap-6 text-sm text-text-secondary">
        <span>{stats.total} projects mapped</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-status-green" />
          EPC found ({stats.withEpc})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-text-tertiary" />
          Needs research ({stats.withoutEpc})
        </span>
        <span className="text-text-tertiary">Circle size = MW capacity</span>
      </div>

      {/* Map */}
      <div className="h-[calc(100vh-220px)] min-h-[500px] overflow-hidden rounded-lg border border-border-subtle">
        <MapContainer
          center={center}
          zoom={5}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mappable.map((project) => {
            const discovery = discoveryMap.get(project.id);
            const color = getMarkerColor(project, discovery);
            const radius = getMarkerRadius(project.mw_capacity);
            const epc = discovery?.epc_contractor ?? project.epc_company;

            return (
              <CircleMarker
                key={project.id}
                center={[project.latitude!, project.longitude!]}
                radius={radius}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.7,
                  weight: 1,
                }}
              >
                <Popup>
                  <div className="min-w-[200px] text-sm">
                    <p className="font-semibold">
                      {project.project_name || project.queue_id}
                    </p>
                    {project.developer && (
                      <p>Developer: {project.developer}</p>
                    )}
                    {epc && epc !== "Unknown" && (
                      <p className="font-medium" style={{ color: "#5CB77A" }}>EPC: {epc}</p>
                    )}
                    {discovery && (
                      <p>
                        Confidence: {discovery.confidence}
                      </p>
                    )}
                    <p>
                      {project.mw_capacity ? `${project.mw_capacity} MW` : ""}
                      {project.state ? ` · ${project.state}` : ""}
                      {project.county ? `, ${project.county}` : ""}
                    </p>
                    <p>
                      {project.iso_region} · Score: {project.lead_score}
                    </p>
                    <Link
                      href={`/projects/${project.id}`}
                      className="mt-1 inline-block"
                      style={{ color: "#E8A230" }}
                    >
                      View details
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
