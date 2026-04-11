/* eslint-disable @typescript-eslint/no-explicit-any */
// frontend/src/components/briefing/BriefingDashboard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BriefingDashboard, {
  BriefingDashboardProps,
} from "./BriefingDashboard";

// Mock all child panels to isolate the shell
vi.mock("./PipelineHealthFooter", () => ({
  default: (props: any) => (
    <div data-testid="pipeline-health-footer">
      Footer: {props.totalProjects}/{props.pendingReview}
    </div>
  ),
}));

vi.mock("./NeedsReviewPanel", () => ({
  default: (props: any) => (
    <div data-testid="needs-review">
      Review: {props.discoveries.length} items
    </div>
  ),
}));

vi.mock("./NeedsInvestigationPanel", () => ({
  default: (props: any) => (
    <div data-testid="needs-investigation">
      Investigation: {props.projects.length} items
    </div>
  ),
}));

vi.mock("./ContactsPanel", () => ({
  default: (props: any) => (
    <div data-testid="contacts-panel">
      Contacts: {props.needContacts.length + props.crmReady.length} items
    </div>
  ),
}));

const mockProps: BriefingDashboardProps = {
  funnel: {
    totalProjects: 423,
    researched: 64,
    pendingReview: 61,
    accepted: 3,
    inCrm: 0,
  },
  pendingDiscoveries: [
    {
      id: "d1",
      epc_contractor: "McCarthy",
      confidence: "confirmed",
      reasoning_summary: "test",
      project_id: "p1",
      project_name: "Solar A",
      mw_capacity: 200,
      iso_region: "ERCOT",
    },
  ],
  totalPending: 61,
  unresearchedProjects: [
    {
      id: "p2",
      project_name: "Solar B",
      iso_region: "CAISO",
      state: "CA",
      lead_score: 80,
    },
  ],
  totalUnresearched: 350,
  needContacts: [
    {
      discovery_id: "d2",
      entity_id: "e1",
      epc_contractor: "Blattner",
      project_name: "Solar C",
      project_id: "p3",
    },
  ],
  crmReady: [],
};

describe("BriefingDashboard", () => {
  it("renders all sub-components", () => {
    render(<BriefingDashboard {...mockProps} />);
    expect(screen.getByTestId("needs-review")).toBeInTheDocument();
    expect(screen.getByTestId("needs-investigation")).toBeInTheDocument();
    expect(screen.getByTestId("contacts-panel")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-health-footer")).toBeInTheDocument();
  });

  it("passes funnel counts to PipelineHealthFooter", () => {
    render(<BriefingDashboard {...mockProps} />);
    expect(screen.getByTestId("pipeline-health-footer")).toHaveTextContent(
      "Footer: 423/61"
    );
  });

  it("passes correct item counts to panels", () => {
    render(<BriefingDashboard {...mockProps} />);
    expect(screen.getByTestId("needs-review")).toHaveTextContent("1 items");
    expect(screen.getByTestId("needs-investigation")).toHaveTextContent(
      "1 items"
    );
    expect(screen.getByTestId("contacts-panel")).toHaveTextContent("1 items");
  });
});
