import type { Schemas } from "@vsolve/api-client";
import { safeNextPath } from "@vsolve/query";

/**
 * Where login sends someone next.
 *
 * Two separate questions, kept apart because only one of them is a security
 * boundary: which path the visitor asked to return to, and — when they asked for
 * nothing — where a Partner in their situation belongs.
 *
 * The security half now lives in `@vsolve/query` so the Customer login route
 * enforces the identical rule rather than a second copy of it. It is re-exported
 * here because that is the name this app's callers and tests already use.
 */

export { safeNextPath };

type Status = Schemas["PartnerApplicationStatusEnum"];

/** Statuses whose remaining work lives in the onboarding tree. */
const UNFINISHED: readonly Status[] = ["DRAFT", "CHANGES_REQUIRED"];

/**
 * The signed-in landing page for an application in this state.
 *
 * An absent application counts as unfinished: the person has not started, and
 * `/apply` is where starting happens. Everything else — including the waiting
 * states and the closed ones — belongs on the home, which states plainly that
 * nothing is owed and links onward. Sending a `SUBMITTED` applicant back into
 * the form would invite them to edit a record a reviewer is holding.
 */
export function homeForApplication(status: Status | null): "/apply" | "/dashboard" {
  if (status === null || UNFINISHED.includes(status)) return "/apply";
  return "/dashboard";
}
