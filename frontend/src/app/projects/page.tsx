import { createClient } from "@/lib/supabase/server";
import { Project, EpcDiscovery } from "@/lib/types";
import EpcDiscoveryDashboard from "@/components/epc/EpcDiscoveryDashboard";

export const revalidate = 3600;

export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("queue_date", { ascending: false });

  const { data: discoveries } = await supabase
    .from("epc_discoveries")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <EpcDiscoveryDashboard
      projects={(projects ?? []) as Project[]}
      discoveries={(discoveries ?? []) as EpcDiscovery[]}
    />
  );
}
