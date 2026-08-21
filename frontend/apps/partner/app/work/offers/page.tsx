import type { Metadata } from "next";

import { OffersGate } from "@/features/offers/view/offers-gate";
import { PartnerShell } from "@/features/session/partner-shell";

/**
 * The A1 direct-offer inbox, at the address the WORK stack sends it to.
 *
 * A routing fix, not a screen. `work-item.ts`'s `DIRECT_OFFER_HREF` points every
 * A1 offer card at `/work/offers` — bare, no id — because `features/offers` has
 * no per-offer detail route: accept, decline, undo and commit are inline
 * controls on the row. Nothing built that page, and `/offers` (where this inbox
 * used to live) now redirects to `/work`, so every A1 card in the stack was a
 * live 404. This closes it.
 *
 * `OffersGate` is mounted unchanged and takes no props — it holds the approval
 * gate, its own loading state and the whole inbox. Restyling it into the
 * tap-first language is deliberately out of scope: the WORK stack already gives
 * an A1 offer a tap-first card, and this list is only reached as the surface
 * that answers one.
 *
 * ## The shell is inlined here, not taken from an `app/work/layout.tsx`
 *
 * Same reason `app/work/page.tsx` gives: a shared layout would have to pick one
 * gate for `/work` (deliberately ungated — its first branch is "you have not
 * applied yet") and for the two routes under it that must be gated. So each
 * route mounts the shell it needs. `requirePartnerRole` is on here because
 * Django's offer list is `IsPartnerUser`, which is also why `app/offers/`
 * carried the same gate in its own layout.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Offers",
  robots: { index: false, follow: false },
};

export default function WorkOffersPage() {
  return (
    <PartnerShell requirePartnerRole>
      <OffersGate />
    </PartnerShell>
  );
}
