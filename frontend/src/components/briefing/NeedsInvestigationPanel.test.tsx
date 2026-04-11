// frontend/src/components/briefing/NeedsInvestigationPanel.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import NeedsInvestigationPanel from "./NeedsInvestigationPanel";

// Mock agentFetch
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn(),
}));

const mockProjects = [
  {
    id: "p1",
    project_name: "Davis Creek 345 kV",
    iso_region: "ERCOT",
    state: "TX",
    lead_score: 94,
  },
  {
    id: "p2",
    project_name: "Mt. Storm 500 kV",
    iso_region: "PJM",
    state: "WV",
    lead_score: 91,
  },
  {
    id: "p3",
    project_name: "Wheatley Switching",
    iso_region: "MISO",
    state: null,
    lead_score: 89,
  },
];

describe("NeedsInvestigationPanel", () => {
  it("renders project list with names and lead scores", () => {
    render(
      <NeedsInvestigationPanel
        projects={mockProjects}
        totalUnresearched={2847}
      />
    );
    expect(screen.getByText("Davis Creek 345 kV")).toBeInTheDocument();
    expect(screen.getByText("Mt. Storm 500 kV")).toBeInTheDocument();
    expect(screen.getByText("94")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
  });

  it("renders Research Queue header with total count", () => {
    render(
      <NeedsInvestigationPanel
        projects={mockProjects}
        totalUnresearched={2847}
      />
    );
    expect(screen.getByText("Research Queue")).toBeInTheDocument();
    expect(screen.getByText("2,847")).toBeInTheDocument();
  });

  it("renders View full pipeline link", () => {
    render(
      <NeedsInvestigationPanel
        projects={mockProjects}
        totalUnresearched={2847}
      />
    );
    const link = screen.getByText("View full pipeline →");
    expect(link.closest("a")).toHaveAttribute("href", "/projects");
  });

  it("renders batch research button with project count", () => {
    render(
      <NeedsInvestigationPanel
        projects={mockProjects}
        totalUnresearched={2847}
      />
    );
    expect(
      screen.getByText(`Research these ${mockProjects.length} →`)
    ).toBeInTheDocument();
  });

  it("shows empty state when no projects", () => {
    render(
      <NeedsInvestigationPanel projects={[]} totalUnresearched={0} />
    );
    expect(
      screen.getByText("All projects have been researched.")
    ).toBeInTheDocument();
  });

  it("renders project context with region and state", () => {
    render(
      <NeedsInvestigationPanel
        projects={mockProjects}
        totalUnresearched={2847}
      />
    );
    expect(screen.getByText("ERCOT · TX")).toBeInTheDocument();
    expect(screen.getByText("PJM · WV")).toBeInTheDocument();
    // Wheatley has no state, so just region
    expect(screen.getByText("MISO")).toBeInTheDocument();
  });
});
