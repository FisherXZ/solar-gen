// frontend/src/components/briefing/BriefingDashboard.tsx
"use client";

import { useState, useCallback } from "react";
import PipelineHealthFooter from "./PipelineHealthFooter";
import NeedsReviewPanel, { PendingDiscovery } from "./NeedsReviewPanel";
import NeedsInvestigationPanel, {
  UnresearchedProject,
} from "./NeedsInvestigationPanel";
import ContactsPanel, {
  NeedContactsItem,
  CrmReadyItem,
} from "./ContactsPanel";

export interface BriefingDashboardProps {
  funnel: {
    totalProjects: number;
    researched: number;
    pendingReview: number;
    accepted: number;
    inCrm: number;
  };
  pendingDiscoveries: PendingDiscovery[];
  totalPending: number;
  unresearchedProjects: UnresearchedProject[];
  totalUnresearched: number;
  needContacts: NeedContactsItem[];
  crmReady: CrmReadyItem[];
}

export default function BriefingDashboard({
  funnel: initialFunnel,
  pendingDiscoveries,
  totalPending,
  unresearchedProjects,
  totalUnresearched,
  needContacts,
  crmReady,
}: BriefingDashboardProps) {
  const [funnel, setFunnel] = useState(initialFunnel);

  const handleReviewCountChange = useCallback((delta: number) => {
    setFunnel((prev) => ({
      ...prev,
      pendingReview: Math.max(0, prev.pendingReview + delta),
      accepted: prev.accepted - delta,
    }));
  }, []);

  return (
    <div className="space-y-6">
      {/* Top row: Review + Research */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NeedsReviewPanel
          discoveries={pendingDiscoveries}
          totalPending={totalPending}
          onCountChange={handleReviewCountChange}
        />
        <NeedsInvestigationPanel
          projects={unresearchedProjects}
          totalUnresearched={totalUnresearched}
        />
      </div>

      {/* Second row: Contacts & CRM */}
      <ContactsPanel needContacts={needContacts} crmReady={crmReady} />

      {/* Footer: pipeline health */}
      <PipelineHealthFooter
        totalProjects={funnel.totalProjects}
        researched={funnel.researched}
        pendingReview={funnel.pendingReview}
        accepted={funnel.accepted}
        inCrm={funnel.inCrm}
      />
    </div>
  );
}
