"use client";

import { EpcSource } from "@/lib/types";

interface SourceCardProps {
  source: EpcSource;
}

const CHANNEL_LABELS: Record<string, string> = {
  developer_pr: "Developer PR",
  trade_publication: "Trade Publication",
  permit_filing: "Permit Filing",
  regulatory_filing: "Regulatory Filing",
  news_article: "News Article",
  company_website: "Company Website",
  sec_filing: "SEC Filing",
  linkedin: "LinkedIn",
  conference: "Conference",
};

const RELIABILITY_COLORS: Record<string, string> = {
  high: "bg-emerald-400",
  medium: "bg-amber-400",
  low: "bg-red-400",
};

function formatChannelLabel(channel: string): string {
  return (
    CHANNEL_LABELS[channel] ||
    channel
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export default function SourceCard({ source }: SourceCardProps) {
  const reliabilityColor =
    RELIABILITY_COLORS[source.reliability] || RELIABILITY_COLORS.low;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">
            {formatChannelLabel(source.channel)}
          </span>
          <span
            className={`inline-block h-2 w-2 rounded-full ${reliabilityColor}`}
            title={`${source.reliability} reliability`}
          />
        </div>
        {source.date && (
          <span className="text-xs text-slate-400">{source.date}</span>
        )}
      </div>

      {source.publication && (
        <p className="mb-1 text-xs font-medium text-slate-500">
          {source.publication}
        </p>
      )}

      <p className="text-sm leading-relaxed text-slate-600">
        {source.excerpt}
      </p>

      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          View source
        </a>
      )}
    </div>
  );
}
