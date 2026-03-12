"use client";

interface GuidanceCardProps {
  data: {
    status_summary?: string;
    question?: string;
    options?: string[];
    awaiting_response?: boolean;
    error?: string;
  };
}

export default function GuidanceCard({ data }: GuidanceCardProps) {
  if (data.error) {
    return (
      <div className="rounded-lg badge-red border border-status-red/20 p-4 text-sm">
        Guidance error: {data.error}
      </div>
    );
  }

  function handleOptionClick(option: string) {
    // Dispatch a custom event that ChatInterface listens for
    // to populate the chat input without auto-sending
    window.dispatchEvent(
      new CustomEvent("populate-chat-input", { detail: { text: option } })
    );
  }

  return (
    <div className="rounded-lg border border-accent-amber/30 bg-accent-amber-muted p-4">
      {data.status_summary && (
        <p className="mb-2 text-sm text-text-secondary">{data.status_summary}</p>
      )}

      {data.question && (
        <p className="mb-3 text-sm font-medium text-text-primary">
          {data.question}
        </p>
      )}

      {data.options && data.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.options.map((option, i) => (
            <button
              key={i}
              onClick={() => handleOptionClick(option)}
              className="rounded-md border border-accent-amber/30 bg-surface-raised px-3 py-1.5 text-xs font-medium text-accent-amber transition-colors hover:bg-surface-overlay"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
