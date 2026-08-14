import type { Metadata } from "next";

import { WorkforceEngagementScreen } from "@/features/engagement/view/engagement-screens";

/**
 * One workforce booking and its shift-days — `M2-FE-501`..`M2-FE-604` and
 * `M2-FE-607`. The C4 tails that used to render a not-built-yet state here were
 * built in Wave B3W and each shift-day now links to its own screen, so **this
 * route carries no placeholder at all**.
 *
 * Keyed by the engagement rather than by the enquiry it came from, so a
 * notification opened weeks later resolves without the request behind it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking",
  robots: { index: false, follow: false },
};

export default async function WorkforceEngagementPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;

  return <WorkforceEngagementScreen engagementId={engagementId} />;
}
