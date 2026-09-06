import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerDashboardHome } from "@/features/session/view/partner-dashboard-home";

/**
 * Where signing in lands: availability, today's money, and anything that needs
 * this Partner right now. Renders RentalHome for rental partners and WorkHome
 * for service partners.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

export default function HomePage() {
  return (
    <PartnerShell>
      <PartnerDashboardHome />
    </PartnerShell>
  );
}
