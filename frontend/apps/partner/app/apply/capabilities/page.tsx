import type { Metadata } from "next";

import { RegistrationScreen } from "@/features/capability/view/capability-screens";

/**
 * Specialist work: what is still needed, where each request stands, and what
 * else can be asked for (`M2-FE-104`, `M2-FE-105`, `M2-FE-109`).
 *
 * Under `/apply` rather than in a tree of its own. A second onboarding tree is
 * how two definitions of "verified" appear —
 * `08-frontend-information-architecture.md` §2 requires registration to stay
 * here and be extended, not forked.
 *
 * `force-dynamic` and never indexed: every word on it depends on the signed-in
 * Partner's own record.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Specialist work",
  robots: { index: false, follow: false },
};

export default function ApplyCapabilitiesPage() {
  return <RegistrationScreen />;
}
