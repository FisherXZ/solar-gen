"use client";

import { useState } from "react";

export default function SourceInfoPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-default text-[10px] font-bold text-text-tertiary hover:border-text-tertiary hover:text-text-secondary transition-colors"
        title="How We Source Data"
        aria-expanded={open}
      >
        i
      </button>

      {open && (
        <div className="absolute left-0 top-6 z-20 w-80 rounded-lg border border-border-subtle bg-surface-overlay p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary">
              How We Source Data
            </h4>
            <button
              onClick={() => setOpen(false)}
              className="text-text-tertiary hover:text-text-secondary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <ul className="space-y-2 text-xs text-text-secondary">
            <li>
              <span className="font-medium text-text-primary">Brave Web Search</span>
              {" "}&mdash; Broad web search across news, blogs, regulatory PDFs, and niche solar industry sites.
            </li>
            <li>
              <span className="font-medium text-text-primary">Tavily Deep Search</span>
              {" "}&mdash; AI-powered deep search optimized for extracting structured information from web pages.
            </li>
            <li>
              <span className="font-medium text-text-primary">Direct Page Fetch</span>
              {" "}&mdash; Full-page reading of specific URLs (press releases, portfolio pages, filings) for detailed extraction.
            </li>
            <li>
              <span className="font-medium text-text-primary">ISO Queue Filing</span>
              {" "}&mdash; Data extracted directly from ISO interconnection queue records (CAISO, ERCOT, MISO).
            </li>
            <li>
              <span className="font-medium text-text-primary">Knowledge Base</span>
              {" "}&mdash; Prior research results and known developer-EPC relationships from our internal database.
            </li>
          </ul>

          <p className="mt-3 border-t border-border-subtle pt-2 text-[11px] text-text-tertiary">
            LinkedIn sources are treated as lowest reliability and are never sufficient alone. All findings are subject to human review.
          </p>
        </div>
      )}
    </div>
  );
}
