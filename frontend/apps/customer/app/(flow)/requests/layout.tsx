import type { ReactNode } from "react";

import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate for the whole `/requests` tree — the four-screen flow, `My
 * requests` and one request's own page.
 *
 * One gate at the layout, on the same reasoning as `/bookings`: several copies
 * of a session decision are several chances to word a lock-out differently, and
 * it is how a Customer with an expired cookie sees an empty request list on one
 * route and a login prompt on the next.
 *
 * `/requests/new` is inside the gate deliberately, unlike `/cart`. The cart is
 * a real anonymous surface and gating it would turn browsing into a signup
 * wall; a requirement is not — `POST /requirements/` is `IsAuthenticated`, it
 * is filed against a Customer, and it goes out to named professionals. Letting
 * someone fill in four screens and discover that at the end would be worse than
 * asking first.
 */
export default function RequestsLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
