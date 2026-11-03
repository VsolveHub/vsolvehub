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

/**
 * Statuses whose page is the onboarding tree: remaining work, a review to wait on, or — for a
 * declined application — the decision itself and how to contact support.
 */
const ONBOARDING_STATUSES: readonly Status[] = [
  "DRAFT",
  "CHANGES_REQUIRED",
  "SUBMITTED",
  "UNDER_REVIEW",
  "DECLINED",
];

/**
 * The signed-in landing page for an application in this state.
 *
 * An applicant whose application is unfinished, waiting or declined belongs in
 * the onboarding tree (/apply). Approved, suspended and closed accounts belong on
 * the portal home (/home).
 */
export function homeForApplication(status: Status | null): "/apply" | "/home" {
  if (status === null || ONBOARDING_STATUSES.includes(status)) return "/apply";
  return "/home";
}
