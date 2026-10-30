import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { DispatchOfferScreen } from "@/features/dispatch/view/dispatch-offer-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instant Job Offer",
  robots: { index: false, follow: false },
};

export default async function DispatchOfferPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const { offerId } = await params;

  return (
    <PartnerShell requirePartnerRole>
      <DispatchOfferScreen offerId={offerId} />
    </PartnerShell>
  );
}
