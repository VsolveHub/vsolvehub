/**
 * The Customer requirement surface: reading contract 1.21.0 safely.
 *
 * Closes the shared half of `M2-FE-213..215`. The hooks themselves live in
 * `apps/customer/features/requirement/queries.ts`, for the reason
 * `workspace.ts` gives: the parser is the durable, React-free, testable half and
 * the hook is a call site. What is here is everything both the app and its tests
 * need to agree on, and nothing that needs a component to exercise.
 *
 * ## The list read once disagreed with its own schema. It no longer does.
 *
 * `GET /api/v1/requirements/` was declared as a bare `RequirementSummary[]`
 * while the view returned `RequirementCursorPagination.get_paginated_response
 * (...)` — a `{next, previous, results}` envelope. drf-spectacular cannot see a
 * paginator instantiated inside a plain `APIView`, so nothing caught it: the
 * schema validated, the client generated, and `.map` over the response would
 * have thrown on the first real request.
 *
 * **Contract 1.23.0 declares `RequirementSummaryPage`**, so the generated type
 * is now the truth and the compensating both-shapes narrowing is deleted — the
 * row is answered in `frontend-execution-plan.md` §7. What remains is a named
 * accessor rather than an inline `.results`, because the cursor is the half
 * still to come.
 *
 * The cursor itself is deliberately *not* threaded through. `My requests` is a
 * list somebody arrives at to find one request; page two is a real feature and
 * it is `FE-213`'s to add.
 */

import { ApiRequestError } from "@vsolve/api-client";
import type { Schemas } from "@vsolve/api-client";

import { CursorContractError } from "./cursor";

export type RequirementSummary = Schemas["RequirementSummary"];
export type RequirementSummaryPage = Schemas["RequirementSummaryPage"];
export type RequirementDraft = Schemas["RequirementDraft"];
export type RequirementSubmitted = Schemas["RequirementSubmitted"];
export type RequirementTimeline = Schemas["RequirementTimeline"];
export type RequirementTimelineEvent = Schemas["RequirementTimelineEvent"];
export type ProbableDuplicate = Schemas["ProbableDuplicate"];
export type RequirementAttachment = Schemas["RequirementAttachment"];
export type RequirementAttachmentKind = Schemas["RequirementAttachmentKindEnum"];
// `AttachmentUploadGrant` was retired at contract 1.44.0 with the requirement
// media-upload operations. `RequirementAttachment` stays: historical records
// remain readable, there is simply no longer a way to create one on this flow.

/**
 * The `My requests` rows out of the page the server sent.
 *
 * Returns `[]` only for a page that genuinely carried no rows — the server
 * declares `results` as required, so there is no longer an "unreadable payload"
 * branch to fall through. The caller still distinguishes empty from failed by
 * query status rather than by array length: an empty list renders "you have not
 * asked for anything yet" only when the read succeeded, and a failed read
 * renders its own error. That is the opposite of the rule `parseWorkspaceGrants`
 * sits under, where `[]` is an authorization answer and had to stay
 * distinguishable from silence.
 */
export function readRequirementList(
  page: RequirementSummaryPage | readonly RequirementSummary[],
): readonly RequirementSummary[] {
  if (Array.isArray(page)) return page;
  return "results" in page ? page.results : [];
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
  if (error instanceof CursorContractError) return false;
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

/* ---------------------------------------------------------------------------
   Attachments — the scan vocabulary, and the one distinction it turns on
   --------------------------------------------------------------------------- */

/**
 * What `RequirementAttachment.scan_status` can carry at contract 1.22.0.
 *
 * Declared here as a runtime list rather than taken from the generated client,
 * because the generated client declares the field as a bare `string`:
 * `RequirementAttachment.scan_status` is serialised from
 * `RequirementAttachment.ProcessingStatus` without a named enum, so **the
 * compiler is checking nothing at all on this field**. A response is bytes, and
 * the only thing standing between an unrecognised verdict and a component is
 * `readScanStatus`.
 *
 * ## `INFECTED` and `FAILED` are separate on purpose, and the difference is the
 * whole reason this module knows about attachments
 *
 * - **`FAILED`** is the upload going wrong: the stored object's size, media type
 *   or SHA-256 did not match what the client declared. The bytes are suspect,
 *   the file is not. **The recovery is to send it again.**
 * - **`INFECTED`** is the malware scanner's verdict. **The recovery is removal
 *   and only removal**, which is why `DELETE .../attachments/{id}/` is permitted
 *   in *any* requirement status while every other attachment write is refused
 *   once the requirement leaves `DRAFT` — so an infected file is never stuck on
 *   a live requirement. A retry button on this verdict would invite somebody to
 *   re-upload malware, and it is the one affordance that must never appear here.
 *
 * Collapsing the two into one client-side "scan failed" is exactly the mistake
 * `apps/requirements/models.py` documents itself against, and it was the shape
 * this client carried until 1.22.0 published the fourth value.
 *
 * It is **not** `CLEAN`. `VERIFIED` is the model's own value; renaming a stored
 * enum to suit a client label is the wrong direction.
 */
export type AttachmentScanStatus = "PENDING" | "VERIFIED" | "INFECTED" | "FAILED";

const SCAN_STATUSES: readonly AttachmentScanStatus[] = [
  "PENDING",
  "VERIFIED",
  "INFECTED",
  "FAILED",
];

/**
 * The verdict, or null when this build does not recognise it.
 *
 * Null rather than a default, so every caller has to decide what an unknown
 * verdict means — and every caller in this codebase decides the same thing:
 * **not usable**. Defaulting to `PENDING` would show a file as "still being
 * checked" forever; defaulting to `VERIFIED` would put an unscanned file in
 * front of a vendor. Failing closed is the only direction that cannot do harm,
 * and it matches how `isRequestStatus` and the timeline's event types already
 * treat a value the server learned after this bundle shipped.
 */
export function readScanStatus(value: string): AttachmentScanStatus | null {
  return SCAN_STATUSES.includes(value as AttachmentScanStatus)
    ? (value as AttachmentScanStatus)
    : null;
}

/**
 * Whether the attachment has cleared its scan and can be shown to a vendor.
 *
 * `VERIFIED` and nothing else. `matching.snapshot_requirement` applies the same
 * rule server-side, which is what makes this safe to render from: the client is
 * describing a decision the server already took, not taking one.
 */
export function isAttachmentUsable(scanStatus: string): boolean {
  return readScanStatus(scanStatus) === "VERIFIED";
}

/**
 * `400 m2_attachment_invalid` — the file itself is the problem.
 *
 * Unsupported media type, over the per-kind ceiling, a malformed checksum, more
 * attachments than one requirement may carry, an expired upload intent, an
 * already-finalized one, or a stored object that does not match what was
 * declared. Not retryable **with the same bytes and the same intent**: the
 * screen has to say which file and why, against that file.
 */
export function isAttachmentInvalid(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_attachment_invalid";
}

/**
 * `503 m2_attachment_unavailable` — storage is down. The only retryable refusal
 * on the attachment path, and the contract says so in those words.
 */
export function isAttachmentUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_attachment_unavailable";
}
