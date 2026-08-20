import { permanentRedirect } from "next/navigation";

import { activityTabHref } from "@/features/activity/view/activity-screen";

/**
 * `My requests` moved into the Activity hub.

 * The route stays because it is *addressed*: notification deep links, the
 * quotes screen's way back, e2e specs and anything a Customer bookmarked all
 * point at `/requests`. Deleting it would turn every one of those into a 404 to
 * save one file.
 *
 * It redirects rather than rendering the list a second time. Two routes drawing
 * the same list is two places to fix a bug in it, and the one that is not the
 * front door is the one that quietly rots.
 */
export default function RedirectToActivity(): never {
  // Permanent rather than temporary: this is an information-architecture
  // decision, not a maintenance window, and a `308` lets browsers and crawlers
  // stop asking. `activityTabHref` owns the target so the segment name lives in
  // exactly one module.
  permanentRedirect(activityTabHref("requests"));
}
