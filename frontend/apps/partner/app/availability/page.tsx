import type { Metadata } from "next";

import { PresenceGate } from "@/features/presence/view/presence-gate";

/**
 * Presence is per-session and per-location, so this route is never cached and
 * never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your availability",
  robots: { index: false, follow: false },
};

export default function AvailabilityPage() {
  return <PresenceGate />;
}
