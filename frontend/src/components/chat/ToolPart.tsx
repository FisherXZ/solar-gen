"use client";

import ProjectListCard from "./parts/ProjectListCard";
import EpcResultCard from "./parts/EpcResultCard";
import BatchProgressCard from "./parts/BatchProgressCard";
import DiscoveryListCard from "./parts/DiscoveryListCard";

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  state: "partial-call" | "call" | "result";
  input?: Record<string, unknown>;
  output?: unknown;
}

interface ToolPartProps {
  toolInvocation: ToolInvocation;
}

function LoadingSkeleton({ toolName }: { toolName: string }) {
  const labels: Record<string, string> = {
    search_projects: "Searching projects...",
    research_epc: "Researching EPC contractor...",
    batch_research_epc: "Running batch research...",
    get_discoveries: "Loading discoveries...",
  };

  return (
    <div className="my-2 animate-pulse rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        <span className="text-sm text-slate-500">
          {labels[toolName] || "Processing..."}
        </span>
      </div>
    </div>
  );
}

export default function ToolPart({ toolInvocation }: ToolPartProps) {
  const { toolName, state, output } = toolInvocation;

  if (state === "partial-call" || state === "call") {
    return <LoadingSkeleton toolName={toolName} />;
  }

  if (state !== "result" || !output) return null;

  const data = output as Record<string, unknown>;

  switch (toolName) {
    case "search_projects":
      return <ProjectListCard data={data} />;
    case "research_epc":
      return <EpcResultCard data={data} />;
    case "batch_research_epc":
      return <BatchProgressCard data={data} />;
    case "get_discoveries":
      return <DiscoveryListCard data={data} />;
    default:
      return (
        <div className="my-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Tool: {toolName}
        </div>
      );
  }
}
