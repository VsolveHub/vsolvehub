/**
 * `/jobs/{id}` is the customer-facing URL for one booking with a professional — the word
 * "engagement" never reaches a customer. `/engagements/*` redirects here (see next.config.ts);
 * `/bookings/[engagementId]` was not possible because `/bookings/[groupId]` (M1) owns that level.
 */
import type { Metadata } from "next";

import EngagementPage from "../../engagements/[engagementId]/page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

export default EngagementPage;
