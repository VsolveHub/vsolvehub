import type { Metadata } from "next";

import { EngagementListScreen } from "@/features/engagement/view/engagement-list-screen";

/**
 * `My bookings` for a workforce (A3) engagement — `M2-FE-509`.
 *
 * ## Why it sits under `/bookings` and why it is not `/bookings/[id]`
 *
 * `08-frontend-information-architecture.md` files A3 under a booking noun,
 * because from the Customer's side hiring people for a period *is* a booking,
 * and files A5 under `/projects` — deliberately, so that one set of words never
 * has to cover two different promises about who holds the money.
 *
 * That document also lists `/bookings/[engagementId]` for the detail, and **that
 * route cannot exist**: `/bookings/[groupId]` has been the M1 Booking Group
 * detail since Milestone 1, and Next.js refuses two different slug names at one
 * path level. A static `workforce` segment beside it is legal (static wins over
 * dynamic) and reads correctly. The engagement detail stays at
 * `/engagements/[engagementId]`, which Wave A2 mounted and argued for: an
 * engagement outlives the request that produced it and is reached from a
 * notification months later with nothing but its own id. Logged in
 * `frontend-execution-plan.md` §7.
 *
 * Dynamic and never indexed — it is somebody's private hiring history.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "People you have hired",
  robots: { index: false, follow: false },
};

export default function WorkforceBookingsPage() {
  return (
    <main>
      <EngagementListScreen
        mode="lead_only"
        engagementHrefFor={(engagementId) => `/engagements/${engagementId}`}
        stageHrefFor={(engagementId, stageId) =>
          `/engagements/${engagementId}/stages/${stageId}`
        }
        newRequestHref="/requests/new"
        requestsHref="/requests"
      />
    </main>
  );
}
