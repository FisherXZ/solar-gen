# Solarina Playbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6 static prompt pills on the agent chat page with a two-column hybrid playbook — dynamic "Right Now" nudges on the left, static outcome cards on the right, all branded "Solarina."

**Architecture:** A single `Playbook` client component replaces `SuggestedPrompts`. It fetches aggregate counts from a new `/api/playbook/stats` Next.js API route on mount, renders dynamic nudge cards (left column) and static outcome cards (right column). Clicking any card pre-fills the chat input via the existing `onSelect` callback. The API route queries Supabase directly using the service client pattern established by existing API routes.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS v4, Supabase (Postgres), React, TypeScript, Vitest + Testing Library

**Target branch:** Create `feature/solarina-playbook` from `main`

**Spec:** `docs/superpowers/specs/2026-04-05-solarina-playbook-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/app/api/playbook/stats/route.ts` | API endpoint returning aggregate counts for dynamic nudges |
| Create | `frontend/src/components/chat/Playbook.tsx` | Main playbook component — header, two columns, all cards |
| Create | `frontend/src/components/chat/Playbook.test.tsx` | Tests for playbook rendering, click interactions, zero states |
| Modify | `frontend/src/components/chat/ChatInterface.tsx:9,49,544,556-567` | Swap SuggestedPrompts import/usage for Playbook, update header text |
| Delete | `frontend/src/components/chat/SuggestedPrompts.tsx` | Replaced by Playbook |

---

### Task 1: Create the /api/playbook/stats endpoint

**Files:**
- Create: `frontend/src/app/api/playbook/stats/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
// frontend/src/app/api/playbook/stats/route.ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const revalidate = 300; // 5 min ISR cache

export async function GET() {
  const supabase = createServiceClient();

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [pendingRes, newProjectsRes, acceptedRes] = await Promise.all([
    // Awaiting review
    supabase
      .from("epc_discoveries")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "pending"),

    // New projects this week
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneWeekAgo.toISOString()),

    // Accepted discoveries with entity info for contact/CRM checks
    supabase
      .from("epc_discoveries")
      .select("id, entity_id, project_id")
      .eq("review_status", "accepted"),
  ]);

  const awaiting_review = pendingRes.count ?? 0;
  const new_projects_this_week = newProjectsRes.count ?? 0;

  // For EPCs needing contacts and leads ready for CRM,
  // we need to check contacts and hubspot_sync_log tables
  const accepted = acceptedRes.data ?? [];
  const entityIds = [
    ...new Set(accepted.map((d) => d.entity_id).filter(Boolean)),
  ] as string[];
  const projectIds = accepted.map((d) => d.project_id).filter(Boolean);

  let epcs_need_contacts = 0;
  let leads_ready_for_crm = 0;

  if (entityIds.length > 0) {
    // Find entities that have at least one contact
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("entity_id")
      .in("entity_id", entityIds);

    const entitiesWithContacts = new Set(
      (contactRows ?? []).map((c: { entity_id: string }) => c.entity_id)
    );

    epcs_need_contacts = entityIds.filter(
      (eid) => !entitiesWithContacts.has(eid)
    ).length;

    // Find projects already synced to HubSpot
    if (projectIds.length > 0) {
      const { data: syncRows } = await supabase
        .from("hubspot_sync_log")
        .select("project_id")
        .in("project_id", projectIds);

      const syncedProjects = new Set(
        (syncRows ?? []).map((s: { project_id: string }) => s.project_id)
      );

      // Leads ready = accepted discoveries where entity has contacts AND not yet synced
      leads_ready_for_crm = accepted.filter((d) => {
        if (!d.entity_id || !d.project_id) return false;
        return (
          entitiesWithContacts.has(d.entity_id) &&
          !syncedProjects.has(d.project_id)
        );
      }).length;
    }
  }

  return NextResponse.json({
    awaiting_review,
    new_projects_this_week,
    epcs_need_contacts,
    leads_ready_for_crm,
  });
}
```

- [ ] **Step 2: Verify the route builds**

Run: `cd frontend && npx next build --no-lint 2>&1 | tail -10`
Expected: Build succeeds without errors for the new route.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/playbook/stats/route.ts
git commit -m "feat(playbook): add /api/playbook/stats endpoint for dynamic nudges"
```

---

### Task 2: Create the Playbook component

**Files:**
- Create: `frontend/src/components/chat/Playbook.tsx`

- [ ] **Step 1: Write the Playbook component**

```tsx
// frontend/src/components/chat/Playbook.tsx
"use client";

import { useEffect, useState } from "react";

interface PlaybookStats {
  awaiting_review: number;
  new_projects_this_week: number;
  epcs_need_contacts: number;
  leads_ready_for_crm: number;
}

interface NudgeConfig {
  key: keyof PlaybookStats;
  label: string;
  color: string;
  prompt: (n: number) => string;
}

const NUDGES: NudgeConfig[] = [
  {
    key: "awaiting_review",
    label: "awaiting review",
    color: "text-accent-amber",
    prompt: (n) => `Let's triage the ${n} pending reviews`,
  },
  {
    key: "new_projects_this_week",
    label: "new projects this week",
    color: "text-status-green",
    prompt: (n) => `What's new this week? Show me the ${n} new projects`,
  },
  {
    key: "epcs_need_contacts",
    label: "EPCs need contacts",
    color: "text-text-primary",
    prompt: (n) => `Find contacts for the ${n} EPCs that need them`,
  },
  {
    key: "leads_ready_for_crm",
    label: "leads ready for CRM",
    color: "text-text-primary",
    prompt: (n) => `Let's push the ${n} ready leads to HubSpot`,
  },
];

interface OutcomeConfig {
  title: string;
  description: string;
  prompt: string;
}

const OUTCOMES: OutcomeConfig[] = [
  {
    title: "Deep-dive a company",
    description: "Research EPC, check filings, find contacts",
    prompt: "I want to deep-dive a company",
  },
  {
    title: "Batch research projects",
    description: "Run EPC discovery on multiple projects at once",
    prompt: "Batch research unresearched projects",
  },
  {
    title: "Triage the review queue",
    description: "Walk through pending discoveries one by one",
    prompt: "Let's triage pending reviews together",
  },
  {
    title: "Pipeline intelligence",
    description: "Market trends, EPC rankings, regional activity",
    prompt: "Give me a pipeline intelligence briefing",
  },
  {
    title: "Scout a new region",
    description: "What's active in a specific ISO, who's building there",
    prompt: "Scout MISO for me — what's active and who's building?",
  },
];

interface PlaybookProps {
  onSelect: (prompt: string) => void;
}

export default function Playbook({ onSelect }: PlaybookProps) {
  const [stats, setStats] = useState<PlaybookStats | null>(null);

  useEffect(() => {
    fetch("/api/playbook/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const activeNudges = stats
    ? NUDGES.filter((n) => stats[n.key] > 0)
    : [];

  const allCaughtUp = stats !== null && activeNudges.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Header */}
      <h2 className="mb-8 text-center font-serif text-2xl tracking-tight text-text-primary">
        Solarina
      </h2>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Left: Right Now */}
        <div>
          <div className="mb-3 text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
            Right Now
          </div>

          {stats === null ? (
            <div className="rounded-lg border border-border-subtle bg-surface-raised p-4">
              <p className="text-xs text-text-tertiary">Loading...</p>
            </div>
          ) : allCaughtUp ? (
            <div className="rounded-lg border border-border-subtle bg-surface-raised p-4 text-center">
              <p className="text-sm text-text-secondary">
                You&apos;re all caught up
              </p>
              <button
                onClick={() => onSelect("Batch research unresearched projects")}
                className="mt-2 text-xs text-accent-amber hover:underline"
              >
                Start batch research →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeNudges.map((nudge) => (
                <button
                  key={nudge.key}
                  onClick={() => onSelect(nudge.prompt(stats[nudge.key]))}
                  className="flex w-full items-baseline gap-2 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left transition-colors hover:border-border-default"
                >
                  <span className={`font-serif text-lg ${nudge.color}`}>
                    {stats[nudge.key]}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {nudge.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Outcome cards (no header) */}
        <div className="space-y-2">
          {OUTCOMES.map((outcome) => (
            <button
              key={outcome.title}
              onClick={() => onSelect(outcome.prompt)}
              className="flex w-full flex-col rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left transition-colors hover:border-accent-amber-muted"
            >
              <span className="text-[13px] font-medium text-text-primary">
                {outcome.title}
              </span>
              <span className="text-[11px] text-text-tertiary">
                {outcome.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/Playbook.tsx
git commit -m "feat(playbook): add Playbook component with dynamic nudges and outcome cards"
```

---

### Task 3: Write tests for the Playbook component

**Files:**
- Create: `frontend/src/components/chat/Playbook.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// frontend/src/components/chat/Playbook.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Playbook from "./Playbook";

const mockStats = {
  awaiting_review: 61,
  new_projects_this_week: 3,
  epcs_need_contacts: 5,
  leads_ready_for_crm: 8,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Playbook", () => {
  it("renders the Solarina header", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<Playbook onSelect={() => {}} />);
    expect(screen.getByText("Solarina")).toBeInTheDocument();
  });

  it("renders dynamic nudges when stats are non-zero", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<Playbook onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("61")).toBeInTheDocument();
    });
    expect(screen.getByText("awaiting review")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("new projects this week")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("hides nudges with zero count", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mockStats,
        epcs_need_contacts: 0,
        leads_ready_for_crm: 0,
      }),
    } as Response);

    render(<Playbook onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("61")).toBeInTheDocument();
    });
    expect(screen.queryByText("EPCs need contacts")).not.toBeInTheDocument();
    expect(screen.queryByText("leads ready for CRM")).not.toBeInTheDocument();
  });

  it("shows 'all caught up' when all stats are zero", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awaiting_review: 0,
        new_projects_this_week: 0,
        epcs_need_contacts: 0,
        leads_ready_for_crm: 0,
      }),
    } as Response);

    render(<Playbook onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    });
    expect(screen.getByText(/Start batch research/)).toBeInTheDocument();
  });

  it("renders all 5 outcome cards", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<Playbook onSelect={() => {}} />);

    expect(screen.getByText("Deep-dive a company")).toBeInTheDocument();
    expect(screen.getByText("Batch research projects")).toBeInTheDocument();
    expect(screen.getByText("Triage the review queue")).toBeInTheDocument();
    expect(screen.getByText("Pipeline intelligence")).toBeInTheDocument();
    expect(screen.getByText("Scout a new region")).toBeInTheDocument();
  });

  it("calls onSelect with prompt when nudge is clicked", async () => {
    const onSelect = vi.fn();
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<Playbook onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText("61")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("61").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith(
      "Let's triage the 61 pending reviews"
    );
  });

  it("calls onSelect with prompt when outcome card is clicked", () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    const onSelect = vi.fn();
    render(<Playbook onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Deep-dive a company"));
    expect(onSelect).toHaveBeenCalledWith("I want to deep-dive a company");
  });

  it("calls onSelect when 'all caught up' batch research link is clicked", async () => {
    const onSelect = vi.fn();
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        awaiting_review: 0,
        new_projects_this_week: 0,
        epcs_need_contacts: 0,
        leads_ready_for_crm: 0,
      }),
    } as Response);

    render(<Playbook onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText(/Start batch research/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Start batch research/));
    expect(onSelect).toHaveBeenCalledWith(
      "Batch research unresearched projects"
    );
  });

  it("handles fetch failure gracefully", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    render(<Playbook onSelect={() => {}} />);

    // Should still render outcome cards (static)
    expect(screen.getByText("Deep-dive a company")).toBeInTheDocument();
    // Stats area stays in loading state (null)
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd frontend && npx vitest run src/components/chat/Playbook.test.tsx`
Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/Playbook.test.tsx
git commit -m "test(playbook): add tests for Playbook component"
```

---

### Task 4: Wire Playbook into ChatInterface and remove SuggestedPrompts

**Files:**
- Modify: `frontend/src/components/chat/ChatInterface.tsx`
- Delete: `frontend/src/components/chat/SuggestedPrompts.tsx`

- [ ] **Step 1: Update the import in ChatInterface.tsx**

Replace line 9:

```tsx
// OLD:
import SuggestedPrompts from "./SuggestedPrompts";

// NEW:
import Playbook from "./Playbook";
```

- [ ] **Step 2: Update the header text (line 544)**

Replace:

```tsx
          <h2 className="text-sm font-medium text-text-primary">
            EPC Discovery Chat
          </h2>
```

with:

```tsx
          <h2 className="text-sm font-medium text-text-primary">
            Solarina
          </h2>
```

- [ ] **Step 3: Replace SuggestedPrompts with Playbook in the empty state (lines 556-567)**

Replace this block:

```tsx
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold font-serif text-text-primary">
                  Solar Project Research Assistant
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Search projects, discover EPC contractors, and review findings.
                </p>
              </div>
              <SuggestedPrompts onSelect={handlePromptSelect} />
            </div>
```

with:

```tsx
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <Playbook onSelect={handlePromptSelect} />
            </div>
```

- [ ] **Step 4: Delete SuggestedPrompts.tsx**

Run: `rm frontend/src/components/chat/SuggestedPrompts.tsx`

- [ ] **Step 5: Verify the build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No type errors. No references to SuggestedPrompts remain.

- [ ] **Step 6: Run all chat-related tests**

Run: `cd frontend && npx vitest run src/components/chat/`
Expected: All Playbook tests pass.

- [ ] **Step 7: Verify no dangling imports**

Run: `grep -r "SuggestedPrompts" frontend/src/`
Expected: No output (zero matches).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/chat/ChatInterface.tsx frontend/src/components/chat/Playbook.tsx frontend/src/components/chat/Playbook.test.tsx
git rm frontend/src/components/chat/SuggestedPrompts.tsx
git commit -m "feat(playbook): wire Playbook into ChatInterface, remove SuggestedPrompts

Replace static prompt pills with two-column Solarina playbook:
- Left: dynamic nudges from /api/playbook/stats
- Right: 5 outcome-oriented workflow cards
- Header renamed to 'Solarina'"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Build the frontend**

Run: `cd frontend && npx next build --no-lint 2>&1 | tail -15`
Expected: Build succeeds. The `/api/playbook/stats` route appears in the output.

- [ ] **Step 3: Start dev server and verify visually**

Run: `cd frontend && npm run dev`

Open `http://localhost:3000/agent` in a browser. Verify:
- "Solarina" shows in serif at the top center
- Left column shows "RIGHT NOW" label with dynamic stat cards
- Right column shows 5 outcome cards with no header
- Clicking a nudge pre-fills the chat input with the templated prompt
- Clicking an outcome card pre-fills the chat input with the goal prompt
- The header bar says "Solarina" instead of "EPC Discovery Chat"
- On mobile width (<640px), columns stack vertically

- [ ] **Step 4: Confirm SuggestedPrompts is fully removed**

Run: `grep -r "SuggestedPrompts\|Solar Project Research Assistant\|EPC Discovery Chat" frontend/src/`
Expected: No matches for old component name or old header text.
