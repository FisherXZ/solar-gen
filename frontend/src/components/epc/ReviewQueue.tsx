"use client";

import React, { useState } from "react";
import ConfidenceBadge from "@/components/epc/ConfidenceBadge";
import ReasoningCard from "@/components/epc/ReasoningCard";
import { PendingDiscoveryWithProject } from "@/lib/types";
import { agentFetch } from "@/lib/agent-fetch";

interface ReviewQueueProps {
  initialDiscoveries: PendingDiscoveryWithProject[];
}

export default function ReviewQueue({ initialDiscoveries }: ReviewQueueProps) {
  const [discoveries, setDiscoveries] =
    useState<PendingDiscoveryWithProject[]>(initialDiscoveries);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAccept(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      const res = await agentFetch(`/api/discover/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accepted" }),
      });
      if (res.ok) {
        setDiscoveries((prev) => prev.filter((d) => d.id !== id));
      } else {
        setError("Failed to accept discovery. Please try again.");
      }
    } catch (err) {
      console.error("Accept failed:", err);
      setError("Failed to accept discovery. Please try again.");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    setLoadingId(id);
    setError(null);
    try {
      const res = await agentFetch(`/api/discover/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rejected", reason: rejectReason.trim() }),
      });
      if (res.ok) {
        setDiscoveries((prev) => prev.filter((d) => d.id !== id));
        setRejectingId(null);
        setRejectReason("");
      } else {
        setError("Failed to reject discovery. Please try again.");
      }
    } catch (err) {
      console.error("Reject failed:", err);
      setError("Failed to reject discovery. Please try again.");
    } finally {
      setLoadingId(null);
    }
  }

  if (discoveries.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-raised p-12 text-center">
        <p className="text-sm text-text-secondary">
          No pending discoveries to review. New discoveries will appear here
          after the agent researches projects.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        {discoveries.length} pending{" "}
        {discoveries.length === 1 ? "discovery" : "discoveries"}
      </p>

      {error && (
        <div className="rounded-lg badge-red border border-status-red/20 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-raised">
        <table className="min-w-full divide-y divide-border-subtle">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Project
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Developer
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-text-tertiary">
                MW
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-tertiary">
                State
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-tertiary">
                EPC Contractor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Confidence
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Created
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-text-tertiary">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {discoveries.map((d) => {
              const project = d.project || {};
              const isRejecting = rejectingId === d.id;
              const isLoading = loadingId === d.id;
              const isExpanded = expandedIds.has(d.id);
              const allLow =
                d.sources?.length > 0 &&
                d.sources.every((s) => s.reliability === "low");

              return (
                <React.Fragment key={d.id}>
                  <tr
                    onClick={() => toggleExpand(d.id)}
                    className={`cursor-pointer transition-colors ${
                      isExpanded ? "bg-surface-overlay" : "hover:bg-surface-overlay"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {project.project_name || "Unnamed"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {project.developer || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-text-secondary">
                      {project.mw_capacity ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {project.state || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {d.epc_contractor}
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBadge
                        confidence={d.confidence}
                        sourceCount={d.source_count ?? d.sources?.length}
                        warning={allLow ? "Unverified" : undefined}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-text-tertiary">
                      {d.created_at
                        ? new Date(d.created_at).toLocaleDateString()
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isRejecting ? (
                        <div
                          className="flex flex-col items-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection (required)"
                            className="w-64 rounded-md border border-border-default bg-surface-overlay px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-1 focus:ring-border-focus"
                            rows={2}
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason("");
                              }}
                              className="rounded-md px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReject(d.id)}
                              disabled={isLoading || !rejectReason.trim()}
                              className="rounded-md bg-status-red px-2.5 py-1 text-xs font-medium text-surface-primary hover:bg-status-red/90 disabled:opacity-50"
                            >
                              Confirm Reject
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="flex justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleAccept(d.id)}
                            disabled={isLoading}
                            className="rounded-md bg-status-green px-2.5 py-1 text-xs font-medium text-surface-primary hover:bg-status-green/90 disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => setRejectingId(d.id)}
                            disabled={isLoading}
                            className="rounded-md bg-status-red/15 px-2.5 py-1 text-xs font-medium text-status-red hover:bg-status-red/25 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr className="border-b border-border-subtle">
                      <td colSpan={8} className="bg-surface-overlay px-8 py-5">
                        <ReasoningCard
                          reasoning={d.reasoning}
                          sources={d.sources || []}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
