import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { PriceBookScreen } from "@/features/price-book/view/price-book-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your rate card",
  robots: { index: false, follow: false },
};

/**
 * "Your rate card" (`/me/rate-card`), reached from the row on `/me`.
 *
 * Wrapped in `PartnerShell requirePartnerRole`, matching `/me/language` and
 * `/me/crew`'s own precedent — `PartnerShell` is the only place the top bar,
 * bottom tabs and sign-out ever render, and a rate card is by definition
 * something only an active, approved Partner has.
 */
export default function RateCardPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PriceBookScreen />
    </PartnerShell>
  );
}
