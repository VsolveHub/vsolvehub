import type { Metadata } from "next";

import { CrewOfferScreen } from "@/features/crew-offer/view/crew-offer-screens";

/**
 * Crew offers — the A3 primary path under ADR-0009 revision 4 (`M2-FE-316`).
 *
 * A day-rate job offered at a price Operations published, dispatched to leads
 * whose approved capability and verified roster cover the headcount, through the
 * same cascade A1 technicians run on: small wave, first accept wins,
 * minutes-level timeouts. There is no composer here and that is the point.
 *
 * Distinct from `/workforce/enquiries`, which is the **quote-flow fallback** for
 * requests with no published rate card. Both are workforce work and both are
 * reached from the workforce workspace; they are separate routes because they ask
 * the vendor for entirely different things — an answer, or a price.
 *
 * `force-dynamic`, never indexed — like every authenticated Partner route. A live
 * dispatch inbox is the last thing that should be served from a cache.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crew offers",
  robots: { index: false, follow: false },
};

export default function WorkforceCrewOffersPage() {
  return <CrewOfferScreen />;
}
