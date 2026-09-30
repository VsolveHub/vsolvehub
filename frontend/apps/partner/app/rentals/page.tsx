import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerRentalsWorkspace } from "@/features/rentals/view/rentals-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rental ads | Vsolve Partners",
  description: "Post and moderate rental ads",
  robots: { index: false, follow: false },
};

/**
 * `/rentals` — the ads a host publishes.
 *
 * Customer bookings (`/rentals/bookings`) are their own destination rather than
 * a card below this form. `SectionNav` is how the phone reaches both; the wide
 * header lists them as nav items.
 */
export default function PartnerRentalsPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerRentalsWorkspace />
    </PartnerShell>
  );
}
