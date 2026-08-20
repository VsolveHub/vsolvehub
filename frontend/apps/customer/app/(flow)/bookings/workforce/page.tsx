import { permanentRedirect } from "next/navigation";

import { activityTabHref } from "@/features/activity/view/activity-screen";

/**
 * The workforce list moved into the Activity hub, under `Booked`.

 * This route was only ever reachable from a sentence at the bottom of the
 * bookings page — which was the problem it is being redirected out of. It stays
 * addressed because notifications about a crew booking point at it.
 */
export default function RedirectToActivity(): never {
  // Permanent rather than temporary: this is an information-architecture
  // decision, not a maintenance window, and a `308` lets browsers and crawlers
  // stop asking. `activityTabHref` owns the target so the segment name lives in
  // exactly one module.
  permanentRedirect(activityTabHref("booked"));
}
