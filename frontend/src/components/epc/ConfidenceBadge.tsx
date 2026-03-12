"use client";

interface ConfidenceBadgeProps {
  confidence: string;
  sourceCount?: number;
  warning?: string;
  size?: "sm" | "md";
}

const BADGE_STYLES: Record<string, string> = {
  confirmed: "badge-green",
  likely: "badge-amber",
  possible: "badge-amber",
  unknown: "badge-neutral",
};

export default function ConfidenceBadge({
  confidence,
  sourceCount,
  warning,
  size = "md",
}: ConfidenceBadgeProps) {
  const style = BADGE_STYLES[confidence] || BADGE_STYLES.unknown;

  const label =
    sourceCount && sourceCount > 0
      ? `${confidence} (${sourceCount} source${sourceCount !== 1 ? "s" : ""})`
      : confidence;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block rounded-full font-semibold capitalize ${style} ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"}`}
      >
        {label}
      </span>
      {warning && (
        <span className="inline-block rounded-full badge-amber px-2 py-0.5 text-xs font-medium">
          Unverified
        </span>
      )}
    </span>
  );
}
