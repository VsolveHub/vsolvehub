import type { ReactNode } from "react";

import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate for the Activity hub.
 *
 * Everything the hub renders is somebody's own record — bookings, requests and
 * engagements are all `IsAuthenticated` reads — so the gate is here rather than
 * repeated inside three lists, on the same reasoning `/requests` and `/bookings`
 * give for theirs: several copies of a session decision are several chances to
 * word a lock-out differently.
 */
export default function ActivityLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
