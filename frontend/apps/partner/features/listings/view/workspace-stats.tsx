import { Card, formatDate, useT } from "@vsolve/ui";
import type { ListingHome } from "../queries";

export interface WorkspaceStatsProps {
  home?: ListingHome;
}

export function WorkspaceStats({ home }: WorkspaceStatsProps) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Card padding="md" className="flex flex-col justify-between">
        <div className="text-xs font-semibold text-text-muted">{t("listings.stats.activeListings")}</div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-text">{home?.active_listings ?? 0}</span>
          <span className="text-xs text-text-muted">
            {home?.plan_limit
              ? t("listings.stats.planLimit", { limit: home.plan_limit })
              : t("listings.stats.noLimit")}
          </span>
        </div>
        <div className="mt-2 text-[11px] text-success-text font-semibold">
          {t("listings.stats.livePlatform")}
        </div>
      </Card>

      <Card padding="md" className="flex flex-col justify-between">
        <div className="text-xs font-semibold text-text-muted">{t("listings.stats.applicantLeads")}</div>
        <div className="mt-1.5 text-2xl font-extrabold text-text">
          {home?.new_applications ?? 0}
        </div>
        <div className="mt-2 text-[11px] text-text-link font-semibold">
          {t("listings.stats.candidateProfiles")}
        </div>
      </Card>

      <Card padding="md" className="flex flex-col justify-between">
        <div className="text-xs font-semibold text-text-muted">{t("listings.stats.hiringSubscription")}</div>
        <div className="mt-1.5 text-sm font-bold text-text truncate">
          {home?.subscription ? home.subscription.plan_name : t("listings.stats.freeTrial")}
        </div>
        <div className="mt-2 text-[11px] text-text-muted">
          {home?.subscription?.ends_at
            ? t("listings.stats.renews", { date: formatDate(home.subscription.ends_at) })
            : t("listings.stats.noActivePlan")}
        </div>
      </Card>
    </div>
  );
}
