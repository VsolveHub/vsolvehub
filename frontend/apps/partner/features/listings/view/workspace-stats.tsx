import type { ListingHome } from "../queries";

export interface WorkspaceStatsProps {
  home?: ListingHome;
}

export function WorkspaceStats({ home }: WorkspaceStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="text-xs font-medium text-slate-500">Active Listings</div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-950">{home?.active_listings ?? 0}</span>
          {home?.plan_limit ? (
            <span className="text-xs text-slate-400">/ {home.plan_limit} quota</span>
          ) : null}
        </div>
        <div className="mt-2 text-[11px] text-emerald-600 font-medium">Live on platform</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="text-xs font-medium text-slate-500">Pending Review</div>
        <div className="mt-1.5 text-2xl font-bold text-slate-950">
          {home?.pending_moderation ?? 0}
        </div>
        <div className="mt-2 text-[11px] text-amber-600 font-medium">In moderation</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="text-xs font-medium text-slate-500">Applicant Leads</div>
        <div className="mt-1.5 text-2xl font-bold text-slate-950">
          {home?.new_applications ?? 0}
        </div>
        <div className="mt-2 text-[11px] text-indigo-600 font-medium">Candidate profiles</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="text-xs font-medium text-slate-500">Hiring Subscription</div>
        <div className="mt-1.5 text-sm font-bold text-slate-950">
          {home?.subscription ? home.subscription.plan_name : "Free / Trial"}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          {home?.subscription?.ends_at
            ? `Renews ${new Date(home.subscription.ends_at).toLocaleDateString()}`
            : "No active plan"}
        </div>
      </div>
    </div>
  );
}
