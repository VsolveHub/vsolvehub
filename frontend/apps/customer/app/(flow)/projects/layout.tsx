import type { ReactNode } from "react";

import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate for `My projects`.
 *
 * Its own tree rather than a branch of `/requests` or `/bookings`, on the
 * information architecture's own reasoning: an A5 project is a funded, staged,
 * platform-protected engagement and an A3 booking is a connection the Customer
 * pays for directly. Filing both under one noun would need one set of words for
 * two different promises about who holds the money — the misrepresentation
 * `M2-FE-415` forbids.
 *
 * One gate at the layout, as `/requests`, `/bookings` and `/engagements` all do:
 * several copies of a session decision are several chances to word a lock-out
 * differently.
 */
export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
