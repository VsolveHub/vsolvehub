import type { ReactNode } from "react";

import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate for the whole `/bookings` tree — list, detail, payment and
 * receipt.
 *
 * One gate at the layout rather than one per screen. Four copies of a session
 * decision is four chances to word a lock-out differently, and it is how a
 * customer with an expired cookie sees an empty booking list on one route and a
 * login prompt on the next.
 *
 * `/cart` deliberately has no equivalent: the anonymous cart is a real surface
 * and gating it would turn browsing into a signup wall.
 */
export default function BookingsLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
