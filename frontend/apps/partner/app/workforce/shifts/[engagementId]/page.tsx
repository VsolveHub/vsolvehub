import type { Metadata } from "next";

import { WorkforceEngagementScreen } from "@/features/engagement/view/engagement-screens";

/**
 * One workforce booking and its shift-days — `M2-FE-501`..`M2-FE-604`,
 * `M2-FE-607`, minus the C4 tails, which render an honest not-built-yet state.
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
