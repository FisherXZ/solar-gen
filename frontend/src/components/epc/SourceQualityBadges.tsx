"use client";

import { EpcSource } from "@/lib/types";

const OFFICIAL_CHANNELS = new Set(["regulatory_filing", "sec_filing"]);
const FIRST_PARTY_CHANNELS = new Set([
  "epc_portfolio",
  "company_website",
  "developer_pr",
]);
const TRADE_PUB_CHANNELS = new Set(["trade_publication"]);

function isRecent(date: string | null): boolean {
  if (!date) return false;
  try {
    const d = new Date(date);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return d >= sixMonthsAgo;
  } catch {
    return false;
  }
}

const pillBase =
  "text-[9px] px-1.5 py-0.5 rounded-full font-medium leading-tight inline-block";

interface SourceQualityBadgesProps {
  source: EpcSource;
}

export default function SourceQualityBadges({
  source,
}: SourceQualityBadgesProps) {
  const badges: { text: string; className: string }[] = [];

  if (OFFICIAL_CHANNELS.has(source.channel)) {
    badges.push({
      text: "Official Filing",
      className: `${pillBase} bg-status-green/15 text-status-green`,
    });
  }

  if (FIRST_PARTY_CHANNELS.has(source.channel)) {
    badges.push({
      text: "First-Party",
      className: `${pillBase} bg-status-green/15 text-status-green`,
    });
  }

  if (TRADE_PUB_CHANNELS.has(source.channel)) {
    badges.push({
      text: "Trade Pub",
      className: `${pillBase} bg-accent-amber-muted text-accent-amber`,
    });
  }

  if (isRecent(source.date)) {
    badges.push({
      text: "Recent",
      className: `${pillBase} border border-accent-amber/30 text-accent-amber`,
    });
  }

  if (source.reliability === "high" && badges.length === 0) {
    badges.push({
      text: "High Reliability",
      className: `${pillBase} bg-status-green/15 text-status-green`,
    });
  }

  if (badges.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {badges.map((b, i) => (
        <span key={i} className={b.className}>
          {b.text}
        </span>
      ))}
    </span>
  );
}
