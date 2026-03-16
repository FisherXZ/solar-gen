"use client";

import { useEffect, useState } from "react";
import { getAllActiveResearch, ActiveResearchEntry } from "./research-state";

/**
 * Returns all active research entries from sessionStorage.
 * Re-scans whenever a research-state-changed event fires.
 * Initializes in useEffect to avoid SSR hydration mismatch.
 */
export function useActiveResearch(): ActiveResearchEntry[] {
  const [entries, setEntries] = useState<ActiveResearchEntry[]>([]);

  useEffect(() => {
    const scan = () => setEntries(getAllActiveResearch());
    scan();
    window.addEventListener("research-state-changed", scan);
    return () => window.removeEventListener("research-state-changed", scan);
  }, []);

  return entries;
}
