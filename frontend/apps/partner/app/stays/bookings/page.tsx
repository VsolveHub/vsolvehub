import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerStayBookingsWorkspace } from "@/features/stays/view/stay-bookings-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stay bookings",
  description: "Paid reservations across your stay properties",
  robots: { index: false, follow: false },
};

/**
 * `/stays/bookings` — paid reservations, the half of a host's stay inbox with
 * money in it.
 *
 * Split from `/stays` alongside enquiries. The reservation list used to be the
 * second card below the property form, which meant a host with a week of
 * arrivals scrolled past their own listing to find out who was coming.
 */
export default function PartnerStayBookingsPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerStayBookingsWorkspace />
    </PartnerShell>
  );
}
