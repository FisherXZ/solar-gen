"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agentFetch } from "@/lib/agent-fetch";

interface ShareButtonProps {
  conversationId: string | null;
  isJobActive: boolean;
}

type ShareState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "shared"; token: string; url: string; sharedAt: string }
  | { status: "error"; message: string };

export default function ShareButton({ conversationId, isJobActive }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ShareState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Fetch current share state when the user opens the popover.
  const loadState = useCallback(async () => {
    if (!conversationId) return;
    setState({ status: "loading" });
    try {
      const res = await agentFetch(`/api/conversations/${conversationId}/share`);
      if (!res.ok) {
        setState({ status: "idle" });
        return;
      }
      const data = await res.json();
      if (data.token) {
        setState({
          status: "shared",
          token: data.token,
          url: absoluteShareUrl(data.token),
          sharedAt: data.shared_at,
        });
      } else {
        setState({ status: "idle" });
      }
    } catch {
      setState({ status: "idle" });
    }
  }, [conversationId]);

  const togglePopover = useCallback(() => {
    setOpen((wasOpen) => {
      const nextOpen = !wasOpen;
      if (nextOpen) {
        // Fire on open; awaited via promise, doesn't block render
        void loadState();
      }
      return nextOpen;
    });
  }, [loadState]);

  const createShare = useCallback(async () => {
    if (!conversationId) return;
    setState({ status: "loading" });
    try {
      const res = await agentFetch(
        `/api/conversations/${conversationId}/share`,
        { method: "POST" }
      );
      if (res.status === 409) {
        setState({
          status: "error",
          message: "Wait for the current response to finish, then try again.",
        });
        return;
      }
      if (!res.ok) {
        setState({ status: "error", message: "Couldn’t create share link. Try again." });
        return;
      }
      const data = await res.json();
      setState({
        status: "shared",
        token: data.token,
        url: absoluteShareUrl(data.token),
        sharedAt: data.shared_at,
      });
    } catch {
      setState({ status: "error", message: "Network error. Try again." });
    }
  }, [conversationId]);

  const revokeShare = useCallback(async () => {
    if (!conversationId) return;
    setState({ status: "loading" });
    try {
      const res = await agentFetch(
        `/api/conversations/${conversationId}/share`,
        { method: "DELETE" }
      );
      if (!res.ok && res.status !== 404) {
        setState({ status: "error", message: "Couldn’t revoke. Try again." });
        return;
      }
      setState({ status: "idle" });
    } catch {
      setState({ status: "error", message: "Network error. Try again." });
    }
  }, [conversationId]);

  const copyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail in insecure contexts — silently skip
    }
  }, []);

  if (!conversationId) return null;

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={togglePopover}
        disabled={isJobActive && state.status !== "shared"}
        className="flex h-8 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-primary px-2.5 text-xs text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40"
        title={isJobActive ? "Wait for response to finish" : "Share conversation"}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-20 w-80 rounded-lg border border-border-default bg-surface-raised shadow-xl">
          <div className="border-b border-border-subtle px-4 py-3">
            <h3 className="font-serif text-[15px] font-medium text-text-primary">
              Share this conversation
            </h3>
            <p className="mt-1 text-xs text-text-tertiary">
              Anyone with the link can view a read-only snapshot.
            </p>
          </div>

          <div className="px-4 py-3">
            {state.status === "loading" && (
              <div className="flex items-center gap-2 py-2">
                <span className="h-2 w-2 rounded-full bg-accent-amber animate-timeline-pulse" />
                <span className="text-xs text-text-tertiary">Working…</span>
              </div>
            )}

            {state.status === "idle" && (
              <button
                type="button"
                onClick={createShare}
                disabled={isJobActive}
                className="w-full rounded-md bg-accent-amber px-3 py-2 text-sm font-medium text-surface-primary transition-colors hover:bg-accent-amber/90 disabled:opacity-40"
              >
                {isJobActive ? "Wait for response…" : "Create share link"}
              </button>
            )}

            {state.status === "shared" && (
              <div className="space-y-2">
                <div className="flex items-stretch gap-1.5">
                  <input
                    readOnly
                    value={state.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded border border-border-default bg-surface-overlay px-2 py-1.5 text-xs text-text-secondary focus:border-border-focus focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => copyUrl(state.url)}
                    className="shrink-0 rounded border border-border-default bg-surface-overlay px-2.5 text-xs text-text-secondary transition-colors hover:bg-accent-amber-muted hover:text-text-primary"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-[11px] text-text-tertiary">
                  Snapshot taken {formatDate(state.sharedAt)}. Messages sent after
                  that aren’t included.
                </p>
                <button
                  type="button"
                  onClick={revokeShare}
                  className="text-xs text-status-red hover:underline"
                >
                  Stop sharing
                </button>
              </div>
            )}

            {state.status === "error" && (
              <div className="space-y-2">
                <p className="text-xs text-status-red">{state.message}</p>
                <button
                  type="button"
                  onClick={() => setState({ status: "idle" })}
                  className="text-xs text-text-tertiary hover:text-text-primary"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function absoluteShareUrl(token: string): string {
  if (typeof window === "undefined") return `/share/${token}`;
  return `${window.location.origin}/share/${token}`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "just now";
  }
}
