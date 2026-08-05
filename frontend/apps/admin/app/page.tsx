import type { Metadata } from "next";

import { StaffHome } from "@/features/session/staff-home";

/**
 * The staff home screen.
 *
 * Dynamic and uncached: everything behind the shell depends on the signed-in
 * person, and a shared cache entry would be wrong for everyone after the first.
 * The anonymous branch renders the sign-in form and nothing else, so an
 * unauthenticated visitor still learns nothing about the system behind it.
 *
 * Which console this opens is decided by the role Django has selected — see
 * `StaffHome`. What is inside each one is deliberately sparse rather than a
 * readiness dashboard: staff need to know what they can do, not what we have not
 * built.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
};

export default function StaffHomePage() {
  return <StaffHome />;
}
