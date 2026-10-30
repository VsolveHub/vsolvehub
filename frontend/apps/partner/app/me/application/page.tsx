import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerDocumentsView } from "@/features/profile/view/partner-documents-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Application & Documents",
  robots: { index: false, follow: false },
};

export default function PartnerApplicationPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerDocumentsView />
    </PartnerShell>
  );
}
