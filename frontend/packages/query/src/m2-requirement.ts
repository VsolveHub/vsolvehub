/**
 * The Customer requirement surface: reading contract 1.21.0 safely.
 *
 * Closes the shared half of `M2-FE-213..215`. The hooks themselves live in
 * `apps/customer/features/requirement/queries.ts`, for the reason
 * `workspace.ts` gives: the parser is the durable, React-free, testable half and
 * the hook is a call site. What is here is everything both the app and its tests
 * need to agree on, and nothing that needs a component to exercise.
 *
 * ## The list read does not match its own schema, and this module is where that
 * is absorbed
 *
 * `GET /api/v1/requirements/` is declared in the OpenAPI document as
 * `RequirementSummary[]`, and the view returns
 * `RequirementCursorPagination.get_paginated_response(...)` — a
 * `{next, previous, results}` envelope. drf-spectacular cannot see a paginator
 * instantiated inside a plain `APIView`, so nothing caught it: the schema
 * validates, the client generates, and `.map` over the response would throw on
 * the first real request.
 *
 * `readRequirementList` accepts either shape rather than picking one. That is a
 * deliberate exception to "do not work around a server defect in the client",
 * made because the alternative is mounting `My requests` in a state that
 * provably cannot work, and taken in one named function with a test rather than
 * spread through a component. **Delete the envelope branch when the C1 fix
 * lands** — the row is in `frontend-execution-plan.md` §7.
 *
 * The cursor itself is deliberately *not* threaded through. `My requests` is a
 * list somebody arrives at to find one request; page two is a real feature and
 * it is `FE-213`'s to add once the shape is settled, not something to build on
 * top of a projection that is currently wrong.
 */

import { ApiRequestError } from "@vsolve/api-client";
import type { Schemas } from "@vsolve/api-client";

export type RequirementSummary = Schemas["RequirementSummary"];
export type RequirementDraft = Schemas["RequirementDraft"];
export type RequirementSubmitted = Schemas["RequirementSubmitted"];
export type RequirementTimeline = Schemas["RequirementTimeline"];
export type RequirementTimelineEvent = Schemas["RequirementTimelineEvent"];
export type ProbableDuplicate = Schemas["ProbableDuplicate"];
export type RequirementAttachment = Schemas["RequirementAttachment"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The `My requests` rows, whichever of the two shapes the server sent.
 *
 * Returns `[]` only for a payload that genuinely carried no rows. An
 * unreadable payload also returns `[]`, and that is safe *here* specifically
 * because the caller distinguishes the two by query status, not by array
 * length: an empty list renders "you have not asked for anything yet" only when
 * the read succeeded, and a failed read renders its own error. This is the
 * opposite of the rule `parseWorkspaceGrants` sits under, where `[]` is an
 * authorization answer and had to stay distinguishable from silence.
 */
export function readRequirementList(payload: unknown): readonly RequirementSummary[] {
  if (Array.isArray(payload)) return payload as RequirementSummary[];
  if (isRecord(payload) && Array.isArray(payload.results)) {
    return payload.results as RequirementSummary[];
  }
  return [];
}

/**
 * Whether a failed M2 read is worth asking again.
 *
 * Copied in behaviour from `apps/partner/features/workspace/queries.ts` rather
 * than re-derived, and then given one addition that column does not need.
 *
 * - **401 and 403** are not retried. Django answers them when the session is
 *   over or the caller is not the Customer these records belong to. Asking
 *   again walks into the same refusal and delays the honest screen — and the
 *   screen it delays is the one that says "sign in again", the only thing that
 *   can actually fix it.
 * - **404 is not retried either.** The M2 requirement views answer 404 rather
 *   than 403 for another Customer's record, deliberately: existence is itself
 *   private and a 403 confirms there is something there to find. So a 404 here
 *   is either "gone" or "not yours", and neither becomes true on a second
 *   attempt.
 *
 * Everything else — a timeout, a 500, a dropped connection — gets two more
 * attempts, because those are the failures that do pass.
 */
export function shouldRetryM2Read(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403 || error.status === 404) return false;
  }
  return failureCount < 2;
}

/**
 * A requirement the Customer can still edit for free.
 *
 * `DRAFT` and nothing else. `CustomerRequirement.is_editable_freely` says the
 * same thing on the server and `PATCH` refuses with `m2_requirement_locked`
 * (409) once a requirement has left it, so this is read as the *client's* copy
 * of a server rule and used only to decide what to offer — never to decide
 * whether a command will succeed, which is the server's answer to give.
 *
 * `M2-FE-211` is built on the complement of this: everything that is not a free
 * edit is an edit vendors have already seen.
 */
export function isFreelyEditable(status: string): boolean {
  return status === "DRAFT";
}

/**
 * Statuses at which a vendor has been shown the requirement.
 *
 * The trigger for `M2-FE-211`'s confirmation. It is the point after which
 * changing the job means telling people who already answered the old one, and
 * it starts at `MATCHING` — an invitation is a vendor seeing it, not an
 * acceptance. Waiting for `QUOTES_READY` would let the one edit that wastes the
 * most vendor work happen silently.
 */
const VENDOR_VISIBLE_STATUSES: readonly string[] = [
  "MATCHING",
  "QUOTES_READY",
  "UNLOCKED",
  "SELECTED",
  "ENGAGED",
];

export function isVendorVisible(status: string): boolean {
  return VENDOR_VISIBLE_STATUSES.includes(status);
}

/** `409 m2_requirement_locked` — the edit reached a requirement vendors have seen. */
export function isRequirementLocked(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_requirement_locked";
}

/** `409 m2_requirement_duplicate` — submit found a live twin and stopped. */
export function isRequirementDuplicate(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_requirement_duplicate";
}

/**
 * `400 m2_lifecycle_not_supported` — this service has no active A3/A5 configuration.
 *
 * Not a validation failure on a field the Customer can see, and it must not be
 * rendered as one. `M2-BE-013` publishes it against `POST /requirements/`
 * precisely so the screen can say "we do not cover this yet" and offer a way
 * back to the catalog.
 */
export function isLifecycleUnsupported(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_lifecycle_not_supported";
}
