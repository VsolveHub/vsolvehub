import type { ReactNode } from "react";

import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate for the engagement tree.
 *
 * Its own layout rather than a child of `/requests`, because an engagement
 * outlives the request that produced it and is addressed by its own id — a
 * Customer reaches it from a notification, a receipt or a bookmark months later,
 * with no requirement id in hand.
 *
 * One gate, at the layout, on the same reasoning `/requests` and `/bookings`
 * give: several copies of a session decision are several chances to word a
 * lock-out differently.
 */
export default function EngagementsLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
