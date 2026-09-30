import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerStaysWorkspace } from "@/features/stays/view/stays-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stay properties | Vsolve Partners",
  description: "Register stay properties and their rooms",
  robots: { index: false, follow: false },
};

/**
 * `/stays` — the properties and rooms a host lists.
 *
 * The ad side of the workspace. Guest enquiries (`/stays/enquiries`) and paid
 * reservations (`/stays/bookings`) are their own destinations rather than cards
 * below the property form, so `SectionNav` here is what the phone uses to reach
 * them; the wide header lists all three as nav items.
 */
export default function PartnerStaysPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerStaysWorkspace />
    </PartnerShell>
  );
}
