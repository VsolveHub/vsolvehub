import type { Metadata } from "next";

import { ProjectEngagementScreen } from "@/features/engagement/view/engagement-screens";

/**
 * One project and its stages — `M2-FE-601`..`M2-FE-604`, `M2-FE-607`, minus
 * `M2-FE-605` and `M2-FE-606`, which render an honest not-built-yet state. Their
 * endpoints landed with Wave C5 at contract 1.31.0; the screens are the part that
 * does not exist.
 *
 * Keyed by the engagement rather than by the requirement it came from, so a
 * notification opened months later resolves without the request behind it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project",
  robots: { index: false, follow: false },
};

export default async function ProjectEngagementPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;

  return <ProjectEngagementScreen engagementId={engagementId} />;
}
