import type { Metadata } from "next";

import { ShiftDayScreen } from "@/features/shift/view/shift-day-screen";

/**
 * One A3 shift-day — `M2-FE-502`..`M2-FE-508` and `M2-FE-513`.
 *
 * Nested under the booking rather than rooted, because a shift-day never
 * outlives the engagement it belongs to and the back link has somewhere honest
 * to go. Both ids are in the path: the day's own commands take the stage id, and
 * the cache key (`m2QueryKeys.shiftDays.forStage`) takes both, so a screen
 * opened from a notification resolves without the booking list behind it.
 *
 * Authorization is inside `ShiftDayScreen`'s `WorkspaceRoute`, not here: a route
 * being reachable never implies its buttons are, and every control on the screen
 * re-checks its own action against the grant.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shift day",
  robots: { index: false, follow: false },
};

export default async function ShiftDayPage({
  params,
}: {
  params: Promise<{ engagementId: string; stageId: string }>;
}) {
  const { engagementId, stageId } = await params;

  return <ShiftDayScreen engagementId={engagementId} stageId={stageId} />;
}
