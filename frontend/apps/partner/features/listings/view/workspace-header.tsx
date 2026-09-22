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
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
          <BriefcaseBusiness className="h-3.5 w-3.5" /> Hiring Partner Workspace
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Career Listings & Applicants
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Publish openings, review incoming applicant leads, and manage hiring subscriptions.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onOpenSubscription}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50"
        >
          <Crown className="h-4 w-4 text-amber-500" />
          {subscriptionPlanName || "Subscription Plans"}
        </button>

        <button
          type="button"
          onClick={onOpenCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Post New Opening
        </button>
      </div>
    </div>
  );
}
