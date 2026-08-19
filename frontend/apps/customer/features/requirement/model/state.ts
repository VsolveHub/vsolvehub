import { firstInvalidOptionalDetail } from "./optional-details";
import { type Screen, nextScreen, screenIndex } from "./screens";

/**
 * The requirement draft, and the guards that protect every step forward.
 *
 * Same discipline as the M1 booking reducer: this stores Customer *intent* and
 * *server verdicts*, never server payloads. What the Customer typed lives here;
 * what the server derived from it — the inferred lifecycle, the plain-language
 * explanation, which answers are still missing — is held as a verdict and never
 * recomputed locally.
 *
 * That split is what keeps the four-screen flow honest. The client does not own
 * the question schema, so it cannot disagree with the server about whether a
 * requirement is complete; it can only be out of date, which is visible.
 *
 * ## Nothing here costs money
 *
 * The whole requirement is free (`FLOW-01`). There is no price, no total and no
 * payment field in this state, and there should never be one: the first money in
 * M2 is the unlock, which happens after quotes arrive and lives in a different
 * feature entirely.
 */

/**
 * Why an attachment is not attached, as a code so the copy stays with the view.
 *
 * ## The one distinction the whole uploader turns on
 *
 * The first three are decided here, before a byte moves. The last four are the
 * server's, and **two of them are the same word in English and opposite
 * instructions in practice**:
 *
 * | Code | Comes from | Recovery |
 * |---|---|---|
 * | `EMPTY` / `TOO_LARGE` / `UNSUPPORTED_TYPE` / `TOO_MANY` | this client, before uploading | pick a different file |
 * | `UPLOAD_FAILED` | the transfer, the presign or storage | **retry** |
 * | `REFUSED` | the server said no on the file's merits, in its own words | pick a different file |
 * | `CHECK_FAILED` | scan status `FAILED` — size, media type or checksum mismatch | **retry** |
 * | `INFECTED` | scan status `INFECTED` — the malware scanner said no | **remove, and never retry** |
 * | `SCAN_UNKNOWN` | a scan status this build does not recognise | remove; fails closed |
 *
 * `SCAN_FAILED` used to be one code covering the last three, because contract
 * 1.21.0 published only `PENDING | VERIFIED | FAILED`. 1.22.0 published
 * `INFECTED` beside `FAILED` precisely so a client could stop offering "try
 * again" for malware, and collapsing them again would put that button back.
 * `SCAN_UNKNOWN` is not retryable for the same reason: an unrecognised verdict
 * could be `INFECTED` under a name this bundle predates.
 */
export type AttachmentFailure =
  | "EMPTY"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "TOO_MANY"
  | "UPLOAD_FAILED"
  | "REFUSED"
  | "CHECK_FAILED"
  | "INFECTED"
  | "SCAN_UNKNOWN";

/**
 * Whether offering "try again" on this failure is honest.
 *
 * The single place that decides whether a retry affordance renders. It is a
 * function rather than a set literal at the call site because getting it wrong
 * in one component is how `INFECTED` gets a retry button on one screen and not
 * another.
 */
export function isRetryableAttachmentFailure(failure: AttachmentFailure | null): boolean {
  return failure === "UPLOAD_FAILED" || failure === "CHECK_FAILED";
}

/** A file the Customer has attached, as the client knows it before upload completes. */
export interface DraftAttachment {
  /** Client-side, stable for the life of the row — never replaced by the server's. */
  id: string;
  /**
   * The server's own id, once the finalize has returned one. Null before that.
   *
   * Held separately from `id` rather than replacing it, and that is what makes
   * a replayed finalize harmless: the row is addressed by its local id
   * throughout, so a second finalize under the same idempotency key updates the
   * row it already created instead of appending a duplicate.
   */
  attachmentId: string | null;
  /**
   * The wire's vocabulary, not a second one.
   *
   * This said `PHOTO` until contract 1.21.0 published
   * `RequirementAttachmentKindEnum` as `IMAGE | VIDEO | AUDIO | VOICE_NOTE |
   * DOCUMENT`. Renamed rather than mapped at the seam, because these values are
   * *bound for* that enum — the upload command sends them — so a private
   * synonym would exist only to be translated once, on the way out, in a
   * direction nothing else travels.
   *
   * `AUDIO` is here even though the picker cannot produce one: since the
   * reducer adopts attachments the server already holds (a resumed draft, a
   * second device), a kind it can send back has to be representable. What the
   * *picker* offers is narrower and lives in `model/upload.ts`.
   */
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "VOICE_NOTE";
  fileName: string;
  byteSize: number;
  /**
   * BCP-47 tag for a voice note. Null for everything else.
   *
   * Carried per attachment rather than only on the requirement because the note
   * is the thing whose language decides whether a vendor can act on it, and
   * `AttachmentUploadRequestRequest.language` is a field on the upload for
   * exactly that reason.
   */
  language: string | null;
  /**
   * Upload and scan progress as one union rather than two booleans.
   *
   * `scanning` is a real, visible state and not a detail: an attachment that has
   * uploaded but not cleared the malware scan is neither attached nor failed, and
   * a boolean pair would let a component render the fourth combination that does
   * not exist. **Nothing may render `scanning` as attached** — someone
   * submitting believing a photo went with it is the harm this state exists to
   * prevent.
   */
  state: "queued" | "uploading" | "scanning" | "attached" | "failed";
  /** Percent, for the progress indicator. Null until an upload starts. */
  progress: number | null;
  failure: AttachmentFailure | null;
  /**
   * The server's own sentence about this refusal, when it gave one.
   *
   * A deliberate exception to "codes here, copy in the view". `m2_attachment_
   * invalid` covers an unsupported media type, an oversized file, a malformed
   * checksum, a thirteenth attachment and a stored object that did not match —
   * one code, five different things to do about it — and Django already writes
   * a user-safe sentence for each. Re-deriving which one it meant from a shared
   * code would be this client guessing at a decision it was told the answer to.
   *
   * Null for anything refused locally, where the client's own copy is better
   * because it can quote the ceiling.
   */
  failureDetail: string | null;
}

/**
 * The server's reading of the answers so far.
 *
 * Null before the first save. `explanation` is the sentence shown to the
 * Customer; `lifecycle` is carried only because the flow's later shape depends on
 * it and is never rendered — see `contract-pending/types.ts`.
 */
export interface LifecycleVerdict {
  lifecycle: "A3_TIME_BLOCK" | "A5_CUSTOM_PROJECT";
  explanation: string;
  /** Answer codes the server still requires. The client does not recompute this. */
  missingRequiredAnswers: readonly string[];
}

export interface RequirementDraftState {
  /** Null until the first save creates the server-side draft. */
  requirementId: string | null;
  categorySlug: string;
  screen: Screen;
  /** Screens completed, so back navigation is predictable and lossless. */
  visited: readonly Screen[];

  answers: Readonly<Record<string, unknown>>;
  verdict: LifecycleVerdict | null;

  addressId: string | null;
  /**
   * ISO date. When the work should start.
   *
   * Added at the 1.21.0 re-point rather than designed in, and it is not
   * decoration: `_assert_submittable` refuses a requirement without it ("when it
   * should start"), and `find_probable_duplicate` matches on it within a
   * ±3-day window, so `GAP-004` cannot work without one either. `M2-FE-203`
   * always said "dates", plural — the built screen had one of them.
   *
   * Held as a **date** while the wire carries a date-time. The Customer is
   * describing a day work should begin, not booking a minute; the time
   * component is added at the seam and documented there.
   */
  requestedStart: string | null;
  /** ISO date. The hard date after which quotes are worthless (`GAP-001`). */
  serviceBy: string | null;
  /**
   * Days either side the Customer can move the start.
   *
   * A number rather than the boolean this used to be. The wire has always taken
   * `flexibility_days`, and collapsing it to yes-or-no meant the brief could say
   * "flexible" and never how flexible — which is the difference between a vendor
   * offering a slot next Tuesday and not bothering.
   */
  flexibilityDays: number;

  attachments: readonly DraftAttachment[];
  /** BCP-47, captured with the voice note so matching can route by language. */
  language: string | null;
  additionalDetails: string;

  optionalDetails: Readonly<Record<string, unknown>>;

  /**
   * Whether the Customer has been shown, and dismissed, the duplicate warning.
   *
   * Recorded so `GAP-004` can offer a merge *before* a second requirement exists
   * without nagging on every keystroke afterwards. Dismissing is an explicit
   * override, not a default.
   */
  duplicateOverridden: boolean;
}

export function initialDraftState(categorySlug: string): RequirementDraftState {
  return {
    requirementId: null,
    categorySlug,
    screen: "what",
    visited: [],
    answers: {},
    verdict: null,
    addressId: null,
    requestedStart: null,
    serviceBy: null,
    flexibilityDays: 0,
    attachments: [],
    language: null,
    additionalDetails: "",
    optionalDetails: {},
    duplicateOverridden: false,
  };
}

/**
 * Why the Customer cannot leave the current screen.
 *
 * A code rather than a sentence, so copy lives with the view and stays
 * translatable, and so tests assert the rule rather than the wording.
 */
export type BlockReason =
  | "REQUIRED_ANSWER_MISSING"
  | "ADDRESS_NOT_CHOSEN"
  | "START_DATE_NOT_CHOSEN"
  | "START_DATE_IN_PAST"
  | "SERVICE_DATE_NOT_CHOSEN"
  | "SERVICE_DATE_IN_PAST"
  /**
   * The needed-by date is before the start date.
   *
   * Refused here rather than left to the server, because the two fields are
   * side by side and the mistake is a typo the Customer can see and fix. It is
   * not a rule the client owns — nothing is recomputed — it is the one
   * relationship between two controls on one screen that a form should not let
   * someone submit.
   */
  | "SERVICE_DATE_BEFORE_START"
  | "ATTACHMENT_STILL_UPLOADING"
  | "ATTACHMENT_FAILED"
  /**
   * A file came back from the malware scan as rejected.
   *
   * Its own reason rather than folded into `ATTACHMENT_FAILED`, because the two
   * instructions differ: a failed upload is retried, a rejected file can only
   * be removed. Blocking on it is deliberate — `DELETE` is permitted in any
   * requirement status precisely so an infected file never gets stuck on a live
   * requirement, and the cheapest way to keep that promise is to not let one
   * travel past the draft in the first place.
   */
  | "ATTACHMENT_REJECTED"
  | "DUPLICATE_NOT_RESOLVED"
  /**
   * An optional extra was opened and left half-said.
   *
   * Reachable only from review, and only for someone who opened a panel — see
   * `firstInvalidOptionalDetail`. Leaving all four alone can never produce this.
   */
  | "OPTIONAL_DETAIL_INCOMPLETE";

/** True when `value` counts as an answer. Empty string, empty array and blank do not. */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Whether the service-by date is still in the future.
 *
 * Takes `today` rather than reading the clock, for the ordinary reason that a
 * function which reads `Date.now()` cannot be tested at a boundary — and for a
 * second reason specific to this field: the authoritative comparison is the
 * server's. `service_by` passing is what moves a requirement to `CLOSED_EXPIRED`,
 * and the client's job is to stop someone submitting a date that is *obviously*
 * gone, not to be the clock.
 */
export function isServiceDateUsable(serviceBy: string, today: string): boolean {
  return serviceBy >= today;
}

/**
 * Attachments that are neither finished nor abandoned.
 *
 * Submitting while one is in flight would drop it silently, which for a photo of
 * the actual problem is the difference between a useful quote and a guess.
 */
export function hasAttachmentInFlight(state: RequirementDraftState): boolean {
  return state.attachments.some(
    (attachment) => attachment.state === "queued" || attachment.state === "uploading",
  );
}

export function hasFailedAttachment(state: RequirementDraftState): boolean {
  return state.attachments.some((attachment) => attachment.state === "failed");
}

/**
 * A file the malware scan rejected.
 *
 * Separate from `hasFailedAttachment` because the recovery is different and the
 * guard's copy has to say which. Checked *before* the general failure so a
 * Customer holding one rejected file and one flaky upload is told about the one
 * they cannot retry.
 */
export function hasRejectedAttachment(state: RequirementDraftState): boolean {
  return state.attachments.some((attachment) => attachment.failure === "INFECTED");
}

/**
 * Attachment rules, in one place, read by both the screen-3 guard and the
 * submit guard on review.
 *
 * Shared for the same reason `blockedDates` is: review re-asserts the earlier
 * screens, and a scan verdict can land *while the Customer is on review* —
 * which is the one path by which a rejected file reaches the submit button at
 * all. Two copies of this ordering is how the two screens stop agreeing.
 */
function blockedAttachments(state: RequirementDraftState): BlockReason | null {
  if (hasAttachmentInFlight(state)) return "ATTACHMENT_STILL_UPLOADING";
  if (hasRejectedAttachment(state)) return "ATTACHMENT_REJECTED";
  if (hasFailedAttachment(state)) return "ATTACHMENT_FAILED";
  return null;
}

/**
 * The two dates and the one relationship between them, in one place.
 *
 * Shared by the `where_when` guard and the submit guard on review rather than
 * written twice: the review guard is a *re-assertion* of the earlier screens
 * (the Customer can go back and change either date), and two copies of a
 * three-clause rule is how the two stop agreeing.
 *
 * Ordered so the Customer is told about the field they are most likely looking
 * at. A missing start date is a blank control; a needed-by date before it is a
 * typo in the second one.
 */
function blockedDates(state: RequirementDraftState, today: string): BlockReason | null {
  if (state.requestedStart === null) return "START_DATE_NOT_CHOSEN";
  if (!isServiceDateUsable(state.requestedStart, today)) return "START_DATE_IN_PAST";
  // The deadline is optional and absent is the ordinary answer.
  //
  // It used to be required, back when the Customer was asked to name the date
  // the job stops being useful. The server derives a closing date from the start
  // day now, so the field survives only for the minority who genuinely have a
  // hard deadline — and a guard still demanding one was blocking Continue on a
  // question the screen itself labels "Optional".
  //
  // What is still checked is a deadline that *was* given and does not make
  // sense: one already past, or one before the work begins. Absent is fine;
  // contradictory is not.
  if (state.serviceBy === null) return null;
  if (!isServiceDateUsable(state.serviceBy, today)) return "SERVICE_DATE_IN_PAST";
  if (state.serviceBy < state.requestedStart) return "SERVICE_DATE_BEFORE_START";
  return null;
}

/**
 * Whether the Customer may leave `state.screen`, and why not if they may not.
 *
 * Returns null when the step is allowed.
 *
 * @param today ISO date in the Customer's timezone, supplied by the caller.
 * @param hasUnresolvedDuplicate Whether a probable duplicate is on screen and
 *   has been neither merged nor explicitly overridden.
 */
export function blockedReason(
  state: RequirementDraftState,
  today: string,
  hasUnresolvedDuplicate = false,
): BlockReason | null {
  switch (state.screen) {
    case "what": {
      // The server owns validity. Before the first save there is no verdict, so
      // an empty answer set is the only thing the client can refuse on its own —
      // and it refuses, because "next" on an untouched form is never intended.
      if (state.verdict === null) {
        return Object.keys(state.answers).some((code) => isAnswered(state.answers[code]))
          ? null
          : "REQUIRED_ANSWER_MISSING";
      }
      const unanswered = state.verdict.missingRequiredAnswers.some(
        (code) => !isAnswered(state.answers[code]),
      );
      return unanswered ? "REQUIRED_ANSWER_MISSING" : null;
    }

    case "where_when": {
      const dates = blockedDates(state, today);
      if (state.addressId === null) return "ADDRESS_NOT_CHOSEN";
      if (dates !== null) return dates;
      if (hasUnresolvedDuplicate && !state.duplicateOverridden) return "DUPLICATE_NOT_RESOLVED";
      return null;
    }

    case "details":
      // Attachments are optional; an attachment that is *mid-flight* is not, and
      // neither is one that came back rejected.
      return blockedAttachments(state);

    case "review": {
      // Re-asserted rather than trusted from the earlier screens, because the
      // Customer can go back and change any of it between there and here. This
      // is the submit guard, and it is the last one.
      if (state.addressId === null) return "ADDRESS_NOT_CHOSEN";
      const dates = blockedDates(state, today);
      if (dates !== null) return dates;
      const attachments = blockedAttachments(state);
      if (attachments !== null) return attachments;
      if (state.verdict !== null) {
        const unanswered = state.verdict.missingRequiredAnswers.some(
          (code) => !isAnswered(state.answers[code]),
        );
        if (unanswered) return "REQUIRED_ANSWER_MISSING";
      }
      // Checked last, because it is the only guard here a Customer can reach
      // without ever having been asked anything — and it is checked at all
      // because a half-said access constraint reaches the vendor looking
      // complete. `M2-FE-207`.
      if (firstInvalidOptionalDetail(state.optionalDetails) !== null) {
        return "OPTIONAL_DETAIL_INCOMPLETE";
      }
      return null;
    }

    default:
      return null;
  }
}

export function canAdvance(
  state: RequirementDraftState,
  today: string,
  hasUnresolvedDuplicate = false,
): boolean {
  return blockedReason(state, today, hasUnresolvedDuplicate) === null;
}

/** The three brief sections, in the order the page renders them. */
export const BRIEF_SECTIONS = ["what", "where_when", "details"] as const;

export type BriefSection = (typeof BRIEF_SECTIONS)[number];

/**
 * What is still missing in each section of the one-page brief.
 *
 * The desktop brief shows all three capture screens at once, so "can I continue"
 * stops being one question about the current screen and becomes three questions
 * about three sections. Rather than write a second set of rules — which is how
 * the page and the wizard end up disagreeing about whether a brief is complete —
 * this asks `blockedReason` the same question once per section, by handing it a
 * state that claims to be on that screen.
 *
 * Safe because `blockedReason` is pure and reads `screen` only to choose a
 * branch. The synthetic value never reaches the reducer.
 *
 * `review` is deliberately not a section: it is the act of sending, not a part
 * of the brief, and its guard re-asserts all three of these anyway.
 */
export function briefSectionBlocks(
  state: RequirementDraftState,
  today: string,
  hasUnresolvedDuplicate = false,
): Record<BriefSection, BlockReason | null> {
  return {
    what: blockedReason({ ...state, screen: "what" }, today, hasUnresolvedDuplicate),
    where_when: blockedReason(
      { ...state, screen: "where_when" },
      today,
      hasUnresolvedDuplicate,
    ),
    details: blockedReason({ ...state, screen: "details" }, today, hasUnresolvedDuplicate),
  };
}

/**
 * Whether `target` is reachable by navigation.
 *
 * Backwards to a visited screen is always allowed and never loses input —
 * `M2-FE-209`. Forwards is not: jumping to review would skip a guard, and the
 * guards are the only thing standing between a Customer and a requirement no
 * vendor can quote.
 *
 * Unlike the M1 booking machine there is no committed point here, because
 * nothing in this flow reserves capacity or takes money. Editing after
 * submission is a different flow with its own rules (`M2-FE-211`).
 */
export function canNavigateTo(state: RequirementDraftState, target: Screen): boolean {
  if (target === state.screen) return true;
  if (screenIndex(target) === -1) return false;
  return state.visited.includes(target);
}

/**
 * Steps forward one screen, recording the one just left as visited.
 *
 * Returns the state unchanged at the end of the sequence rather than throwing:
 * review has no successor, and "submit" is a different action with its own guard.
 */
export function advance(state: RequirementDraftState): RequirementDraftState {
  const next = nextScreen(state.screen);
  if (next === null) return state;
  return {
    ...state,
    screen: next,
    visited: state.visited.includes(state.screen)
      ? state.visited
      : [...state.visited, state.screen],
  };
}
