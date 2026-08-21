import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { EnquiryDetailScreen } from "@/features/enquiry/view/enquiry-detail-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enquiry",
  robots: { index: false, follow: false },
};

/**
 * The enquiry accept/decline gate (`/work/enquiries/[invitationId]`), reached
 * from `NeedsPriceCard` on the merged WORK stack.
 *
 * Wrapped in `PartnerShell requirePartnerRole`, matching every other route in
 * this plan (`/me`, `/me/crew`, `/work/offers/[invitationId]`): `PartnerShell`
 * is the only place `BottomTabBar`, the top bar and the notification bell ever
 * render, so a bare screen here would have no way back to Work, Money or Me.
 */
export default async function EnquiryPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  return (
    <PartnerShell requirePartnerRole>
      <EnquiryDetailScreen invitationId={invitationId} />
    </PartnerShell>
  );
}
