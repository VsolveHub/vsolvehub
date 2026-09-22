import { BriefcaseBusiness, Crown, Plus } from "lucide-react";

export interface WorkspaceHeaderProps {
  subscriptionPlanName?: string;
  onOpenSubscription: () => void;
  onOpenCreate: () => void;
}

export function WorkspaceHeader({
  subscriptionPlanName,
  onOpenSubscription,
  onOpenCreate,
}: WorkspaceHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-text-link uppercase tracking-wider">
          <BriefcaseBusiness className="size-3.5" /> Hiring Partner Workspace
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text sm:text-3xl">
          Career Listings & Applicants
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Publish openings, review incoming applicant leads, and manage hiring subscriptions.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onOpenSubscription}
          className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-text-secondary shadow-card transition hover:border-line-strong hover:bg-surface-hover"
        >
          <Crown className="size-4 text-signal-500" />
          {subscriptionPlanName || "Subscription Plans"}
        </button>

        <button
          type="button"
          onClick={onOpenCreate}
          className="inline-flex items-center gap-2 rounded-control bg-action px-4 py-2.5 text-sm font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active"
        >
          <Plus className="size-4" />
          Post New Opening
        </button>
      </div>
    </div>
  );
}
