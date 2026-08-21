import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { VisitScreen } from "@/features/visit/view/visit-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Site visit",
  robots: { index: false, follow: false },
};

export default async function VisitPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  return (
    <PartnerShell requirePartnerRole>
      <VisitScreen invitationId={invitationId} />
    </PartnerShell>
  );
}
