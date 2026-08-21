import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { ShiftDayScreen } from "@/features/shift/view/shift-day-screen";

/**
 * One A3 shift-day — `M2-FE-502`..`M2-FE-508` and `M2-FE-513`.
 *
 * Moved from `app/workforce/shifts/[engagementId]/days/[stageId]/page.tsx` and
 * otherwise unchanged: the parent segment is now `[id]` rather than
 * `[engagementId]`, because `/work/jobs/[id]` serves both record kinds and
 * cannot name its parameter after one of them. `next.config.ts` redirects the
 * old path here.
 *
 * Nested under the job rather than rooted, because a shift-day never outlives
 * the engagement it belongs to and the back link has somewhere honest to go.
 * Both ids are in the path: the day's own commands take the stage id, and the
 * cache key (`m2QueryKeys.shiftDays.forStage`) takes both, so a screen opened
 * from a notification resolves without the booking list behind it.
 *
 * Authorization is inside `ShiftDayScreen`'s `WorkspaceRoute`, not here: a route
 * being reachable never implies its buttons are, and every control on the screen
 * re-checks its own action against the grant. That gate is `A3_TIME_BLOCK`,
 * which is why `EngagementJobView` links only `LEAD_ONLY` stages at this path —
 * an A5 vendor sent here would meet a refusal rather than their stage.
 *
 * The shell is mounted here rather than in a layout, for the reason
 * `app/work/jobs/[id]/page.tsx` records: the old `app/workforce/layout.tsx` that
 * used to supply it is gone, and a layout under this segment would nest a second
 * shell inside the parent page's.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shift day",
  robots: { index: false, follow: false },
};

export default async function ShiftDayPage({
  params,
}: {
  params: Promise<{ id: string; stageId: string }>;
}) {
  const { id, stageId } = await params;

  return (
    <PartnerShell requirePartnerRole>
      <ShiftDayScreen engagementId={id} stageId={stageId} />
    </PartnerShell>
  );
}
