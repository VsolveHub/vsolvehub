import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerRentalBookingsWorkspace } from "@/features/rentals/view/rental-bookings-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rental bookings",
  description: "Customer reservations across your rental ads",
  robots: { index: false, follow: false },
};

/**
 * `/rentals/bookings` — the demand side of the ads.
 *
 * An A7 rental has no enquiry stage: a customer reserves an asset and it lands
 * as a booking. So this is the only demand-side destination a rental host has,
 * and it is rental-only — `RENTAL_TAP_FIRST_NAV` is what puts it in the nav,
 * and that array is served only to A7-only partners. Stay hosts get `Bookings`
 * from `STAY_TAP_FIRST_NAV` instead, pointing at their own reservations.
 */
export default function PartnerRentalBookingsPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerRentalBookingsWorkspace />
    </PartnerShell>
  );
}
