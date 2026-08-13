import type { Metadata } from "next";

import { EngagementScreen } from "@/features/engagement/view/engagement-screen";

/**
 * One agreement — `M2-FE-415`..`M2-FE-418`.
 *
 * Keyed by the engagement rather than by the request, because that is how the
 * server addresses it (`GET /engagements/{id}/`) and because it is the durable
 * record: the request that produced it can close, and this stays readable
 * through the warranty window.
 *
 * The request it came from is linked from inside rather than being in the path,
 * so a Customer arriving from a notification months later needs nothing but the
 * engagement id.
 *
 * Dynamic and never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your agreement",
  robots: { index: false, follow: false },
};

export default async function EngagementPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;
  return (
    <main>
      {/* The requirement id is on the record, not in this path, so the route is
          supplied as a function and the screen applies it once the engagement
          has loaded. `requestsHref` is what a failed read falls back to — a real
          page, rather than a link built from an id we never received. */}
      <EngagementScreen
        engagementId={engagementId}
        requestHrefFor={(requirementId) => `/requests/${requirementId}`}
        requestsHref="/requests"
      />
    </main>
  );
}
