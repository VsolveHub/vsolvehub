import { permanentRedirect } from "next/navigation";

import { activityTabHref } from "@/features/activity/model/routes";

/**
 * `My bookings` moved into the Activity hub.

 * Kept as an addressed route for the same reason `/requests` is: the payment
 * tree under `/bookings/{id}` still lives here, and a bookmark or a
 * notification pointing at the list itself must land somewhere real.
 */
export default function RedirectToActivity(): never {
  // Permanent rather than temporary: this is an information-architecture
  // decision, not a maintenance window, and a `308` lets browsers and crawlers
  // stop asking. `activityTabHref` owns the target so the segment name lives in
  // exactly one module.
  permanentRedirect(activityTabHref("booked"));
}
