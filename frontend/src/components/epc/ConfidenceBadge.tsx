"use client";

interface ConfidenceBadgeProps {
  confidence: string;
}

const BADGE_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700",
  likely: "bg-blue-100 text-blue-700",
  possible: "bg-amber-100 text-amber-700",
  unknown: "bg-slate-100 text-slate-600",
};

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const style = BADGE_STYLES[confidence] || BADGE_STYLES.unknown;

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${style}`}
    >
      {confidence}
    </span>
  );
}
