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
  title: "Your booking",
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
      {/* Route builders live in `@/lib/routes` and the screen imports them. They
          were four function props until the RSC boundary refused to serialize
          them — the requirement id is on the record rather than in this path, and
          the list an engagement belongs to depends on how it is paid for, so both
          are still resolved *after* the record loads. That reasoning moved into
          the module; only the delivery mechanism changed. */}
      <EngagementScreen engagementId={engagementId} />
    </main>
  );
}
