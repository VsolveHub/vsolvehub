import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerStayVisitsWorkspace } from "@/features/stays/view/stay-visits-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Visit requests | Vsolve Partners",
  description: "Guests asking to visit your stay properties",
  robots: { index: false, follow: false },
};

/** `/stays/visits` — guests who scheduled a visit, to accept or decline. */
export default function PartnerStayVisitsPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerStayVisitsWorkspace />
    </PartnerShell>
  );
}
