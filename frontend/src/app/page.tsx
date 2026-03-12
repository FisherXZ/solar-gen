import { createClient } from "@/lib/supabase/server";
import EpcDiscoveryDashboard from "@/components/epc/EpcDiscoveryDashboard";

export const revalidate = 3600;

export default async function PipelinePage() {
  const supabase = await createClient();

  const [projectsResult, discoveriesResult] = await Promise.all([
    supabase
      .from("projects")
      .select("*", { count: "exact" })
      .order("lead_score", { ascending: false })
      .limit(10000),
    supabase
      .from("epc_discoveries")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (projectsResult.error) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-red-600">
          Failed to load projects: {projectsResult.error.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
        <p className="mt-1 text-sm text-slate-500">
          Utility-scale solar projects from ISO interconnection queues
        </p>
      </div>
      <EpcDiscoveryDashboard
        projects={projectsResult.data || []}
        discoveries={discoveriesResult.data || []}
      />
    </main>
  );
}
