import { createClient } from "@/lib/supabase/server";
import EpcDiscoveryDashboard from "@/components/epc/EpcDiscoveryDashboard";

export const revalidate = 3600; // revalidate every hour

export default async function EpcDiscoveryTablePage() {
  const supabase = await createClient();

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .gte("expected_cod", "2025-01-01")
    .lte("expected_cod", "2027-12-31")
    .order("lead_score", { ascending: false });

  const { data: discoveries, error: discoveriesError } = await supabase
    .from("epc_discoveries")
    .select("*")
    .order("created_at", { ascending: false });

  if (projectsError) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-red-600">
          Failed to load projects: {projectsError.message}
        </p>
      </main>
    );
  }

  if (discoveriesError) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-red-600">
          Failed to load EPC discoveries: {discoveriesError.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">EPC Discovery — Table View</h1>
        <p className="mt-1 text-sm text-slate-500">
          Browse and research EPC contractors in table format
        </p>
      </div>
      <EpcDiscoveryDashboard
        projects={projects || []}
        discoveries={discoveries || []}
      />
    </main>
  );
}
