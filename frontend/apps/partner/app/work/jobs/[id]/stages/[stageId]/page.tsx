import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { ProjectEngagementScreen } from "@/features/engagement/view/engagement-screens";

/**
 * One A5 engagement's full stage list, agreement, amendments and payouts —
 * `M2-FE-605`/`606`'s Criticals fix.
 *
 * `ProjectEngagementScreen` already existed, already wraps `EngagementDetail`
 * in `WorkspaceRoute workspaceKey={PROJECT_WORKSPACE}`, and was never mounted
 * by any route — `engagement-job-view.tsx`'s A5 stage rows rendered as plain
 * text with nothing behind them. This is the mirror of the existing A3 route
 * (`app/work/jobs/[id]/days/[stageId]/page.tsx`) in URL shape only:
 * `EngagementDetail` takes an `engagementId`, not a `stageId` — it renders
 * every stage of the engagement together with the agreement/amendment/payout
 * panels, the same way `EngagementJobView` at `/work/jobs/[id]` already shows
 * the whole stage list rather than one stage in isolation. There is no
 * narrower "one stage only" rendering path built anywhere in
 * `features/engagement` today, and `AgreementPanel`/`AmendmentPanel`/
 * `PayoutPanel` are engagement-level facts, not stage-level ones — building a
 * per-stage split is a materially bigger change than this fix calls for.
 * `stageId` is accepted here only so `engagement-job-view.tsx`'s per-stage
 * link keeps the same URL shape the A3 side already uses.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project stage",
  robots: { index: false, follow: false },
};

export default async function ProjectStagePage({
  params,
}: {
  params: Promise<{ id: string; stageId: string }>;
}) {
  const { id, stageId } = await params;

  return (
    <PartnerShell requirePartnerRole>
      <ProjectEngagementScreen engagementId={id} stageId={stageId} />
    </PartnerShell>
  );
}
