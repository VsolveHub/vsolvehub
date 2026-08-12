import type { Metadata } from "next";

import { DemandScreen } from "@/features/capability/view/capability-screens";

/**
 * Masked live demand — the end of the express path (`M2-FE-101`).
 *
 * `express-path.ts` has pointed `DEMAND_HREF` here since Wave B1, at a route
 * that did not exist: `GET /partner/demand-preview/` was proposal 0013 and
 * unpublished. Contract 1.22.0 published it, so the four-step path now ends
 * somewhere real.
 *
 * **No gate stands in front of this screen.** Not KYC, not payout details, not a
 * crew roster — that is proposal 0013's first constraint and the reason the path
 * is four steps long. What the Partner sees is masked by the *server*: no
 * customer name, no phone, no street address and no exact budget, with a locality
 * rather than an address and a preview id that resolves on no requirement route.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Work near you",
  robots: { index: false, follow: false },
};

export default function ApplyDemandPage() {
  return <DemandScreen />;
}
