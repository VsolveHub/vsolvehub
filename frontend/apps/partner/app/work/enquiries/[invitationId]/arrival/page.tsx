import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { ArrivalScreen } from "@/features/visit/view/arrival-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arrival code",
  robots: { index: false, follow: false },
};

/**
 * The arrival-code step (`/work/enquiries/[invitationId]/arrival`), reached from
 * the enquiry screen's "Start OTP" action.
 *
 * A route rather than a panel because entering the code is the one thing on the
 * visit-day path that wants the whole screen: the vendor is standing in front of
 * the customer, reading six digits back at them.
 *
 * Wrapped in `PartnerShell requirePartnerRole` like every other route in this
 * plan — the shell is the only place the top bar and its back button render.
 */
export default async function ArrivalPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  return (
    <PartnerShell requirePartnerRole>
      <ArrivalScreen invitationId={invitationId} />
    </PartnerShell>
  );
}
