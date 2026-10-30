import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerStayEnquiriesWorkspace } from "@/features/stays/view/stay-enquiries-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guest enquiries",
  description: "Guest enquiries about your stay properties",
  robots: { index: false, follow: false },
};

/**
 * `/stays/enquiries` — the unpaid half of a host's stay inbox.
 *
 * A route rather than a card, so it is in the desktop nav, so a link to it means
 * something, and so the dock's `Stays` tab and this screen cannot disagree about
 * where a host is. `PartnerShell` supplies the chrome; `getPartnerChromeMode`
 * gives the whole `/stays` tree "full" chrome, because every screen under it is a
 * destination rather than a detail step.
 */
export default function PartnerStayEnquiriesPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerStayEnquiriesWorkspace />
    </PartnerShell>
  );
}
