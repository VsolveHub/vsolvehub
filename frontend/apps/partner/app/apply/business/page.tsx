import type { Metadata } from "next";

import { BusinessProfileScreen } from "@/features/capability/view/capability-screens";

/**
 * Business identity: individual, workforce agency or project vendor
 * (`M2-FE-103`).
 *
 * Deliberately **not** one of the four steps on the path to demand. The server
 * defaults every Partner to `INDIVIDUAL`, so somebody who never opens this
 * screen already has an answer, and spending one of four steps on a question
 * most Partners never answer differently would break the flow-weight budget for
 * no gain. It becomes necessary when a Partner asks to be approved as something
 * else, which is where the registration plan links to it from.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How you work",
  robots: { index: false, follow: false },
};

export default function ApplyBusinessPage() {
  return <BusinessProfileScreen />;
}
