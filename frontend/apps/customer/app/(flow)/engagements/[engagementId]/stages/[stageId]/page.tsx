import type { Metadata } from "next";

import { StageReviewScreen } from "@/features/engagement/view/stage-review-screen";

/**
 * The stage review — `M2-FE-609`.
 *
 * Its own route rather than a panel inside the engagement, for two reasons that
 * both matter more than the extra file:
 *
 * 1. **It is reached from a notification.** "Your professional has submitted
 *    Tuesday's work" links to one stage, and a Customer arriving on a long
 *    agreement should land on the thing they were told about rather than
 *    scrolling for it.
 * 2. **It is the money screen.** Approval releases the professional's earning,
 *    and a screen that consequential is worth being addressable, linkable and
 *    reloadable on its own.
 *
 * Nested under the engagement because the engagement is what says how this job
 * is paid for — the same `POST .../approve/` releases held money on a managed
 * agreement and moves nothing on a lead-only one, so the review cannot describe
 * its own consequence without it. Both ids come from the path rather than from
 * state, so a reload and a pasted link behave identically.
 *
 * Dynamic and never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check the work",
  robots: { index: false, follow: false },
};

export default async function StageReviewPage({
  params,
}: {
  params: Promise<{ engagementId: string; stageId: string }>;
}) {
  const { engagementId, stageId } = await params;
  return (
    <main>
      <StageReviewScreen
        engagementId={engagementId}
        stageId={stageId}
        engagementHref={`/engagements/${engagementId}`}
      />
    </main>
  );
}
