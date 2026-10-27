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

/** Statuses whose remaining work or waiting review lives in the onboarding tree. */
const ONBOARDING_STATUSES: readonly Status[] = [
  "DRAFT",
  "CHANGES_REQUIRED",
  "SUBMITTED",
  "UNDER_REVIEW",
];

/**
 * The signed-in landing page for an application in this state.
 *
 * An applicant with an unfinished or submitted application belongs in the
 * onboarding registration flow (/apply). Only fully APPROVED partners belong on
 * the portal home (/home).
 */
export function homeForApplication(
  status: Status | null,
  hasRejectedDocs = false,
): "/apply" | "/home" {
  if (status === null || ONBOARDING_STATUSES.includes(status) || hasRejectedDocs) return "/apply";
  return "/home";
}
