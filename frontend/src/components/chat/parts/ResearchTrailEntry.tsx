"use client";

const STAGE_LABELS: Record<string, string> = {
  planning: "Planning",
  searching: "Searching",
  reading: "Reading",
  verifying: "Verifying",
  analyzing: "Analyzing",
  switching_strategy: "Switching",
};

interface ResearchTrailEntryProps {
  data: {
    stage?: string;
    message?: string;
    detail?: string;
    search_query?: string;
    url?: string;
    finding?: string;
    candidate?: string;
  };
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return null;
  }
}

/* Stage icons — small inline SVGs */
function StageIcon({ stage }: { stage: string }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-text-tertiary";
  switch (stage) {
    case "searching":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      );
    case "reading":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      );
    case "verifying":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      );
    case "analyzing":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      );
    case "switching_strategy":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      );
    case "planning":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function ResearchTrailEntry({ data }: ResearchTrailEntryProps) {
  const stage = data.stage || "";
  const stageLabel = STAGE_LABELS[stage] || stage || "Update";

  return (
    <div className="flex items-start gap-2.5 rounded-md bg-surface-overlay px-3 py-2">
      {/* Stage badge */}
      <span className="mt-0.5 shrink-0 rounded bg-surface-raised px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
        {stageLabel}
      </span>

      {/* Enriched content */}
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <StageIcon stage={stage} />

        <div className="min-w-0 flex-1">
          {/* Searching: show the query in monospace */}
          {stage === "searching" && data.search_query ? (
            <p className="font-mono text-xs text-text-tertiary bg-surface-primary px-1.5 py-0.5 rounded inline-block">
              {data.search_query}
            </p>
          ) : /* Reading: show linked domain */
          stage === "reading" && data.url ? (
            <div>
              <a
                href={data.url.startsWith("http") ? data.url : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-accent-amber hover:text-accent-amber/80 truncate block"
              >
                {getDomain(data.url) || data.url}
              </a>
              {data.finding && (
                <p className="mt-0.5 text-xs text-text-tertiary">{data.finding}</p>
              )}
            </div>
          ) : /* Verifying: show candidate + finding */
          stage === "verifying" && data.candidate ? (
            <div>
              <span className="text-xs font-medium text-accent-amber">
                {data.candidate}
              </span>
              {data.finding && (
                <p className="mt-0.5 text-xs text-text-tertiary">{data.finding}</p>
              )}
            </div>
          ) : /* Analyzing / switching_strategy: show finding */
          (stage === "analyzing" || stage === "switching_strategy") && data.finding ? (
            <p className="text-xs text-text-secondary">{data.finding}</p>
          ) : (
            /* Fallback: plain message */
            <div>
              <p className="text-sm text-text-secondary">{data.message}</p>
              {data.detail && (
                <p className="mt-0.5 text-xs text-text-tertiary">{data.detail}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
