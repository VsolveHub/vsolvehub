import type { Metadata } from "next";

import { EngagementListScreen } from "@/features/engagement/view/engagement-list-screen";

/**
 * `My projects` — `M2-FE-608`.
 *
 * Overall progress, the active stage, the funded amount, the next action and
 * whether a problem is open, for every managed (A5) engagement the Customer has.
 * The route the information architecture names, and the same read as
 * `/bookings/workforce` — `GET /engagements/` is one list and `commercial_mode`
 * is the split.
 *
 * The project's own workspace is `/engagements/[engagementId]`, which Wave A2
 * mounted: an engagement is addressed by its own id so it survives a
 * notification opened months after the request closed.
 *
 * Dynamic and never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your projects",
  robots: { index: false, follow: false },
};

export default function ProjectsPage() {
  return (
    <main>
      <EngagementListScreen
        mode="managed"
        newRequestHref="/requests/new"
        requestsHref="/requests"
      />
    </main>
  );
}
