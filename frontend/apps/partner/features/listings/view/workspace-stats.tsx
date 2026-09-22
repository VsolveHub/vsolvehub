import { Card } from "@vsolve/ui";
import type { ListingHome } from "../queries";

export interface WorkspaceStatsProps {
  home?: ListingHome;
}

export function WorkspaceStats({ home }: WorkspaceStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card padding="md" className="flex flex-col justify-between">
        <div className="text-xs font-semibold text-text-muted">Active Listings</div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-text">{home?.active_listings ?? 0}</span>
          {home?.plan_limit ? (
            <span className="text-xs text-text-muted">/ {home.plan_limit} quota</span>
          ) : null}
        </div>
        <div className="mt-2 text-[11px] text-success-text font-semibold">Live on platform</div>
      </Card>

      <Card padding="md" className="flex flex-col justify-between">
        <div className="text-xs font-semibold text-text-muted">Pending Review</div>
        <div className="mt-1.5 text-2xl font-extrabold text-text">
          {home?.pending_moderation ?? 0}
        </div>
        <div className="mt-2 text-[11px] text-warning-text font-semibold">In moderation</div>
      </Card>

      <Card padding="md" className="flex flex-col justify-between">
        <div className="text-xs font-semibold text-text-muted">Applicant Leads</div>
        <div className="mt-1.5 text-2xl font-extrabold text-text">
          {home?.new_applications ?? 0}
        </div>
        <div className="mt-2 text-[11px] text-text-link font-semibold">Candidate profiles</div>
      </Card>

      <Card padding="md" className="flex flex-col justify-between">
        <div className="text-xs font-semibold text-text-muted">Hiring Subscription</div>
        <div className="mt-1.5 text-sm font-bold text-text truncate">
          {home?.subscription ? home.subscription.plan_name : "Free / Trial"}
        </div>
        <div className="mt-2 text-[11px] text-text-muted">
          {home?.subscription?.ends_at
            ? `Renews ${new Date(home.subscription.ends_at).toLocaleDateString()}`
            : "No active plan"}
        </div>
      </Card>
    </div>
  );
}
