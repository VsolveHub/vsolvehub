import type { Metadata } from "next";

import { OffersGate } from "@/features/offers/view/offers-gate";

/**
 * The Partner offer inbox.
 *
 * Every offer belongs to one Partner, so this route is never cached and never
 * indexed. `force-dynamic` matches the rest of the authenticated Partner tree.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your offers",
  robots: { index: false, follow: false },
};

export default function OffersPage() {
  return <OffersGate />;
}
