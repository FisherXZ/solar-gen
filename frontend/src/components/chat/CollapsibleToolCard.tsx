"use client";

import { useState, useEffect, useRef } from "react";

interface CollapsibleToolCardProps {
  icon: React.ReactNode;
  label: string;
  status: "running" | "done" | "error";
  defaultExpanded: boolean;
  summary?: string;
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
}

function StatusIndicator({ status }: { status: "running" | "done" | "error" }) {
  if (status === "running") {
    return (
      <span className="inline-flex shrink-0">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-default border-t-text-secondary" />
      </span>
    );
  }
  if (status === "done") {
    return (
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-status-green"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  // error
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-status-red"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-text-tertiary transition-transform duration-200 ${
        expanded ? "rotate-180" : ""
      }`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function CollapsibleToolCard({
  icon,
  label,
  status,
  defaultExpanded,
  summary,
  headerAction,
  children,
}: CollapsibleToolCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const prevStatusRef = useRef(status);
  const hasChildren = !!children;

  // Auto-update expansion when status transitions from running to done/error
  useEffect(() => {
    if (prevStatusRef.current === "running" && status !== "running") {
      setExpanded(defaultExpanded);
    }
    prevStatusRef.current = status;
  }, [status, defaultExpanded]);

  const handleClick = () => {
    if (hasChildren) {
      setExpanded((prev) => !prev);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-raised">
      {/* Header — muted, compact, subordinate to main text */}
      <div
        onClick={handleClick}
        className={`flex items-center gap-2 px-3 py-1.5 ${
          hasChildren ? "cursor-pointer select-none hover:bg-surface-overlay" : ""
        }`}
      >
        <span className="text-text-tertiary">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">
          {label}
        </span>
        {summary && (
          <span className="shrink-0 text-[11px] text-text-tertiary">{summary}</span>
        )}
        {headerAction}
        <StatusIndicator status={status} />
        {hasChildren && <Chevron expanded={expanded} />}
      </div>

      {/* Collapsible body */}
      {hasChildren && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border-subtle">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
