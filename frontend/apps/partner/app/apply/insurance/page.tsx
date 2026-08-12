import type { Metadata } from "next";

import { InsuranceScreen } from "@/features/capability/view/capability-screens";

/**
 * The worker insurance and liability declaration (`M2-FE-106` / `GAP-022`).
 *
 * Asked for when a Partner applies for work where they send people onto someone
 * else's site, not at registration. Which capabilities require it is
 * `requires_insurance` on the server's own option and capability records — this
 * app never concludes "A3 means insurance", because that is a policy which can
 * change per variant.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Worker insurance",
  robots: { index: false, follow: false },
};

export default function ApplyInsurancePage() {
  return <InsuranceScreen />;
}
