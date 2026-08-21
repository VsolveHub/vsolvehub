import { permanentRedirect } from "next/navigation";

import { activityTabHref } from "@/features/activity/model/routes";

/**
 * `My projects` moved into the Activity hub.

 * The project's own workspace is `/engagements/{id}` and is untouched; only the
 * list moved. The route stays addressed so a notification opened months after
 * the request closed still lands somewhere real.
 */
export default function RedirectToActivity(): never {
  // Permanent rather than temporary: this is an information-architecture
  // decision, not a maintenance window, and a `308` lets browsers and crawlers
  // stop asking. `activityTabHref` owns the target so the segment name lives in
  // exactly one module.
  permanentRedirect(activityTabHref("projects"));
}
