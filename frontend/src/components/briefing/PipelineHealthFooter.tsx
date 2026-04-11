// frontend/src/components/briefing/PipelineHealthFooter.tsx

interface PipelineHealthFooterProps {
  totalProjects: number;
  researched: number;
  pendingReview: number;
  accepted: number;
  inCrm: number;
}

export default function PipelineHealthFooter({
  totalProjects,
  researched,
  pendingReview,
  accepted,
  inCrm,
}: PipelineHealthFooterProps) {
  return (
    <p className="text-center text-[11px] text-text-tertiary">
      Pipeline: {totalProjects.toLocaleString()} queued · {researched} researched
      {" · "}{pendingReview} reviewable · {accepted} accepted · {inCrm} in CRM
    </p>
  );
}
