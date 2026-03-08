"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export default function ResearchButton({
  projectId,
  hasExisting,
}: {
  projectId: string;
  hasExisting: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const router = useRouter();

  async function handleResearch() {
    setStatus("loading");
    try {
      const res = await fetch(`${AGENT_API_URL}/api/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed with status ${res.status}`);
      }

      setStatus("done");
      // Refresh server data so the page shows the new discovery
      router.refresh();
    } catch (err) {
      console.error("Research failed:", err);
      setStatus("error");
    }
  }

  if (status === "loading") {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
      >
        <svg
          className="h-4 w-4 animate-spin"
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
        Researching...
      </button>
    );
  }

  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
        Research complete
      </span>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-red-500">Research failed</span>
        <button
          onClick={handleResearch}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleResearch}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
    >
      {hasExisting ? "Research" : "Research EPC"}
    </button>
  );
}
