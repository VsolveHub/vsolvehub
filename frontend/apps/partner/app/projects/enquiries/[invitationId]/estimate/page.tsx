import type { Metadata } from "next";

import { OnsiteEstimateScreen } from "@/features/proposal/view/onsite-screen";

/**
 * The A5 on-site estimate composer (`M2-FE-315`).
 *
 * Its own route rather than a section of the enquiry, because it is opened at a
 * different moment and in a different place — standing at the customer's
 * address, after the visit, on a phone.
 *
 * A server component, deliberately. `export const dynamic` and `metadata` are
 * ignored in a `"use client"` module, and the first cut of the M2 routes was
 * prerendered as static, indexable HTML because of it. This page holds a
 * vendor's own draft estimate and belongs to the authenticated tree.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estimate",
  robots: { index: false, follow: false },
};

export default async function OnsiteEstimatePage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  return <OnsiteEstimateScreen invitationId={invitationId} />;
}
