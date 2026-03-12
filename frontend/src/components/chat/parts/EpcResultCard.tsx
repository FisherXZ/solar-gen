"use client";

import { useState } from "react";
import ConfidenceBadge from "@/components/epc/ConfidenceBadge";
import ReasoningCard from "@/components/epc/ReasoningCard";
import { EpcSource } from "@/lib/types";

interface Discovery {
  id: string;
  project_id: string;
  epc_contractor: string;
  confidence: string;
  sources: EpcSource[];
  reasoning: string | null;
  review_status: string;
}

interface EpcResultCardProps {
  data: {
    discovery?: Discovery;
    skipped?: boolean;
    reason?: string;
    error?: string;
  };
}

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export default function EpcResultCard({ data }: EpcResultCardProps) {
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  if (data.error) {
    return (
      <div className="rounded-lg badge-red border border-status-red/20 p-4 text-sm">
        Research error: {data.error}
      </div>
    );
  }

  if (data.skipped) {
    return (
      <div className="rounded-lg badge-amber border border-status-amber/20 p-4 text-sm">
        Skipped — already has an accepted EPC discovery.
      </div>
    );
  }

  const discovery = data.discovery;
  if (!discovery) return null;

  const status = reviewStatus || discovery.review_status;

  async function handleReview(action: "accepted" | "rejected") {
    setIsReviewing(true);
    try {
      const res = await fetch(
        `${AGENT_API_URL}/api/discover/${discovery!.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (res.ok) {
        setReviewStatus(action);
      }
    } catch (err) {
      console.error("Review failed:", err);
    } finally {
      setIsReviewing(false);
    }
  }

  return (
    <div className="bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">
            {discovery.epc_contractor}
          </span>
          <ConfidenceBadge confidence={discovery.confidence} />
        </div>
        {status === "accepted" && (
          <span className="badge-green rounded-full px-2 py-0.5 text-xs font-medium">
            Accepted
          </span>
        )}
        {status === "rejected" && (
          <span className="badge-red rounded-full px-2 py-0.5 text-xs font-medium">
            Rejected
          </span>
        )}
      </div>

      <ReasoningCard
        reasoning={discovery.reasoning}
        sources={discovery.sources}
      />

      {status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => handleReview("accepted")}
            disabled={isReviewing}
            className="rounded-md bg-status-green px-3 py-1.5 text-xs font-medium text-surface-primary transition-colors hover:bg-status-green/90 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={() => handleReview("rejected")}
            disabled={isReviewing}
            className="rounded-md bg-status-red/15 px-3 py-1.5 text-xs font-medium text-status-red transition-colors hover:bg-status-red/25 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
