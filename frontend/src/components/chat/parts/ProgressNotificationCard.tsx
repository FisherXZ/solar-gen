"use client";

const STAGE_LABELS: Record<string, string> = {
  planning: "Planning",
  searching: "Searching",
  reading: "Reading",
  verifying: "Verifying",
  analyzing: "Analyzing",
  switching_strategy: "Switching strategy",
};

interface ProgressNotificationCardProps {
  data: {
    stage?: string;
    message?: string;
    detail?: string;
  };
}

export default function ProgressNotificationCard({
  data,
}: ProgressNotificationCardProps) {
  const stageLabel = STAGE_LABELS[data.stage || ""] || data.stage || "Update";

  return (
    <div className="flex items-start gap-2.5 rounded-md bg-surface-overlay px-3 py-2">
      <span className="mt-0.5 shrink-0 rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
        {stageLabel}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-text-secondary">{data.message}</p>
        {data.detail && (
          <p className="mt-0.5 text-xs text-text-tertiary">{data.detail}</p>
        )}
      </div>
    </div>
  );
}
