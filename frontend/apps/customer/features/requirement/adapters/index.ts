import type { Schemas } from "@vsolve/api-client";
import { readScanStatus } from "@vsolve/query";
import type {
  ProbableDuplicate,
  RequirementAttachment,
  RequirementDraft,
  RequirementSummary,
  RequirementTimeline,
  RequirementTimelineEvent,
} from "@vsolve/query";
import type { Attachment, AttachmentKind } from "@vsolve/ui";

import type { ServerAttachment } from "../model/machine";
import type { RequestClosureReason, RequestStatus } from "../model/request-state";
import { isTimelineEventKind, type TimelineEventKind } from "../model/timeline";
import {
  isRetryableAttachmentFailure,
  type AttachmentFailure,
  type DraftAttachment,
  type LifecycleVerdict,
} from "../model/state";
import { MAXIMUM_ATTACHMENTS, formatBytes, maximumSizeFor } from "../model/upload";

/**
 * The only code that knows what the wire looks like.
 *
 * Re-pointed at contract 1.21.0 on 12 August 2026. It previously mapped from
 * `../contract-pending/types.ts`; it now maps from the generated client, and —
 * as `contract-pending/README.md` promised — **no component and no component
 * test changed with it.** The three field shapes that differed are handled
 * here, each in one place:
 *
 * | Was | Is | Where |
 * |---|---|---|
 * | `is_date_flexible: boolean` | `flexibility_days: number`, source of truth | `toDraftIntent` / `flexibilityDaysFor` |
 * | `AttachmentKind: "PHOTO"` | `"IMAGE"` | the model's own union, renamed |
 * | `ScanStatus: "CLEAN" \| "INFECTED"` | `PENDING \| VERIFIED \| INFECTED \| FAILED` | `toScanOutcome` |
 *
 * Three shapes the handover note did not mention differed too, and they are
 * absorbed here for the same reason: `answers` and `detail` arrive as `unknown`
 * rather than as records, `status`/`closure_reason`/`inferred_lifecycle` arrive
 * as bare `string` rather than as the enums the schema also declares, and the
 * attachment carries `size_bytes` with no `file_name` at all.
 */

/**
 * The two catalogue records the flow is opened with.
 *
 * Aliased here rather than imported from `@vsolve/api-client` at the call site
 * because `requirement-flow.tsx` lives under `view/`, and `boundary.test.ts`
 * forbids that layer from naming the generated client — a rule it was quietly
 * breaking. The types are structurally identical; what changes is that the wire
 * is named in the one place that is allowed to name it.
 */
export type RequirementService = Schemas["ServiceDetail"];
export type RequirementVariant = Schemas["ServiceVariantConfiguration"];

/**
 * One question on screen 1, as the server describes it.
 *
 * The client does not own this list. Which questions exist, which are required
 * and what they offer are catalogue configuration, and a hardcoded copy here
 * would be a second source of truth that silently disagrees with the one the
 * server validates against.
 */
export interface RequirementQuestionView {
  code: string;
  label: string;
  /** Plain-language help, shown under the control. */
  help?: string;
  kind: "text" | "number" | "choice" | "boolean";
  /** Present for `choice` only. */
  options?: readonly { value: string; label: string }[];
  required: boolean;
}

/**
 * The question kinds screen 1 has a control for, and the one it does not.
 *
 * `MULTIPLE_CHOICE` is absent on purpose rather than by omission. The M2
 * validator (`carts.item_inputs.validate_scope`, shared with A1) accepts
 * `INTEGER`, `TEXT`, `BOOLEAN` and `SELECT` — there is no list-valued answer it
 * would take — so a multiple-choice question on an A3/A5 variant is a
 * configuration that cannot be submitted, whatever this screen renders for it.
 * Guessing a control would produce an answer the submit command refuses, with
 * the refusal landing on the Customer.
 */
const QUESTION_KIND: Record<string, RequirementQuestionView["kind"]> = {
  TEXT: "text",
  NUMBER: "number",
  SINGLE_CHOICE: "choice",
  BOOLEAN: "boolean",
};

export interface QuestionSet {
  questions: readonly RequirementQuestionView[];
  /**
   * Question codes this build cannot render a control for.
   *
   * Surfaced rather than swallowed. A required question with no control is a
   * flow whose "Next" is disabled for a reason nothing on screen explains, and
   * the honest response is to say the service is not set up for requests yet —
   * which is what `WhatScreen` does with this.
   */
  unsupported: readonly string[];
}

/**
 * Screen 1's questions, from the variant configuration the catalog publishes.
 *
 * The same source the A1 booking workspace reads (`ServiceVariantConfiguration.
 * questions`), for the same reason: it is the only published projection of the
 * question schema. What it is *not* is the schema the M2 submit command
 * validates against — that lives in `M2VariantConfiguration.question_schema`
 * and has no read endpoint — so the two are authored separately by Operations
 * and a mismatch surfaces only at submit. Logged in the execution plan §7.
 */
export function toQuestionSet(
  variant: Schemas["ServiceVariantConfiguration"],
): QuestionSet {
  const questions: RequirementQuestionView[] = [];
  const unsupported: string[] = [];

  for (const question of variant.questions) {
    const kind = QUESTION_KIND[question.kind];
    if (kind === undefined) {
      unsupported.push(question.code);
      continue;
    }
    questions.push({
      code: question.code,
      label: question.prompt,
      // Django publishes `blank=True` text fields as `""`, and an empty string
      // handed to `Field`'s `description` renders an empty paragraph under the
      // control. Absent and empty are the same thing here.
      help: question.help_text === "" ? undefined : question.help_text,
      kind,
      required: question.is_required,
      options:
        kind === "choice"
          ? question.options.map((option) => ({ value: option.code, label: option.label }))
          : undefined,
    });
  }

  return { questions, unsupported };
}

/** A probable duplicate, ready to render. */
export interface DuplicateView {
  id: string;
  summary: string;
  createdLabel: string;
  mergeable: boolean;
}

/**
 * `My requests` row, and the header of one request's detail.
 *
 * Carries the status as a **code**, not a label. An earlier version mapped it to
 * a sentence here, which put customer-facing copy in the adapter layer and,
 * worse, flattened away the distinction `M2-FE-215` turns on: the delayed-match
 * state is derived from the status *and* the deadline together (see
 * `../model/request-state.ts`), so a component handed a finished label has
 * already lost the ability to tell "still looking" from "we are late".
 */
export interface RequestRowView {
  id: string;
  title: string;
  status: RequestStatus;
  /** The quote-delivery promise. Null when the requirement has no live deadline. */
  deadlineAt: string | null;
  /** The hard date after which quotes are worthless (`GAP-001`). */
  serviceBy: string | null;
  /** How many quotes are waiting. A count only — never who sent them. */
  teaserCount: number;
  /** Set only when closed, and never collapsed into a generic "closed". */
  closure: RequestClosureReason | null;
  /** When anything last happened. Null when nothing has since submission. */
  lastActivityAt: string | null;
  /** The server's plain-language reading of the requirement. Never an archetype. */
  lifecycleExplanation: string | null;
}

/* --------------------------------------------------------------------------
   Narrowing the wire's bare strings
   -------------------------------------------------------------------------- */

/**
 * The statuses this build knows how to render, as a runtime list.
 *
 * The summary and the draft do publish `RequirementStatusEnum`, so the compiler
 * checks the mapping — and that is exactly why this check has to exist as well.
 * A type is a claim about a document; a response is bytes. The day Django gains
 * a thirteenth status, every deployed bundle receives it and none of them was
 * recompiled, and an unrecognised status reaching `REQUEST_STATE_COPY` renders
 * `undefined.explanation` rather than failing visibly.
 *
 * `closure_reason` and the timeline's `type` are published as bare `string`, so
 * for those two the compiler is not checking anything at all.
 */
const REQUEST_STATUSES: readonly RequestStatus[] = [
  "DRAFT",
  "MATCHING",
  "QUOTES_READY",
  "UNLOCKED",
  "SELECTED",
  "ENGAGED",
  "CLOSED_NO_SUPPLY",
  "CLOSED_SLA_BREACH",
  "CLOSED_EXPIRED",
  "CLOSED_ABANDONED",
  "CLOSED_COMPLETE",
  "CLOSED_CANCELLED",
];

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && REQUEST_STATUSES.includes(value as RequestStatus);
}

const CLOSURE_REASONS: readonly RequestClosureReason[] = [
  "NO_SUPPLY",
  "SLA_BREACH",
  "EXPIRED",
  "ABANDONED",
  "COMPLETE",
  "CANCELLED",
];

function toClosureReason(value: string | null): RequestClosureReason | null {
  if (value === null) return null;
  return CLOSURE_REASONS.includes(value as RequestClosureReason)
    ? (value as RequestClosureReason)
    : null;
}

/**
 * The requirement's own answer bag.
 *
 * `answers` is `unknown` on the wire because Django publishes a `JSONField`
 * without a shape. Narrowed to a record here, and to an *empty* record for
 * anything else, because the reducer indexes it by question code and a string
 * or an array reaching that would read `undefined` for every question — which
 * looks exactly like a Customer who has answered nothing.
 */
function readAnswers(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/* --------------------------------------------------------------------------
   Draft
   -------------------------------------------------------------------------- */

/**
 * The server's reading of the answers, or null before it can give one.
 *
 * Returns null when the server sent a lifecycle without an explanation. The
 * explanation is the only part the Customer sees, and a verdict that cannot be
 * explained is one the UI has nothing truthful to render — better to show
 * nothing than to invent the sentence.
 *
 * `inferred_lifecycle` arrives as a bare `string`; only the two archetypes the
 * client models are accepted. A third would mean the platform learned a
 * lifecycle this bundle has no screens for, and carrying it as a verdict would
 * let the flow behave as though it did.
 */
export function toLifecycleVerdict(draft: RequirementDraft): LifecycleVerdict | null {
  if (draft.lifecycle_explanation === null) return null;
  if (draft.inferred_lifecycle !== "A3_TIME_BLOCK" && draft.inferred_lifecycle !== "A5_CUSTOM_PROJECT") {
    return null;
  }
  return {
    lifecycle: draft.inferred_lifecycle,
    explanation: draft.lifecycle_explanation,
    missingRequiredAnswers: draft.missing_required_answers,
  };
}

/**
 * What the reducer takes from a server draft when resuming one.
 *
 * Intent only, and the same subset `sessionStorage` carries — see
 * `RESTORE_INTENT`. The verdict travels separately (`toLifecycleVerdict`)
 * because it is a server answer with its own invalidation rule, and attachments
 * do not travel at all: the reducer's `DraftAttachment` describes a file being
 * uploaded from *this* device, and a row read back from the server has no local
 * handle behind it.
 */
export interface DraftIntent {
  answers: Readonly<Record<string, unknown>>;
  addressId: string | null;
  serviceBy: string | null;
  isDateFlexible: boolean;
  additionalDetails: string;
  language: string | null;
}

export function toDraftIntent(draft: RequirementDraft): DraftIntent {
  return {
    answers: readAnswers(draft.answers),
    addressId: draft.address_id,
    serviceBy: draft.service_by,
    // The integer is the source of truth and the boolean is the server's own
    // derivation of it (`flexibility_days > 0`). Read the boolean rather than
    // re-deriving it, so the two cannot disagree about what zero days means.
    isDateFlexible: draft.is_date_flexible,
    additionalDetails: draft.additional_details,
    language: draft.language === "" ? null : draft.language,
  };
}

/**
 * How many days of flexibility a ticked checkbox means.
 *
 * The one place the boolean/integer mismatch has to be resolved in the writing
 * direction, and the only value in this feature that is neither the Customer's
 * nor the server's. `PATCH /requirements/{id}/` accepts `flexibility_days` and
 * not `is_date_flexible`, while screen 2 asks a yes/no question — deliberately,
 * because "how many days" is a question most Customers cannot answer about a
 * job they have not scoped.
 *
 * Three, because "a few days" is what the control says and three is what "a
 * few" means. It is stated here rather than buried in a call site so that if
 * either the copy or the contract changes, the other one is visible in the same
 * file. If matching ever needs a real window, screen 2 asks for one and this
 * constant goes away — it must not quietly become a default that outlives the
 * question it stands in for.
 */
export const FLEXIBLE_WINDOW_DAYS = 3;

export function flexibilityDaysFor(isDateFlexible: boolean): number {
  return isDateFlexible ? FLEXIBLE_WINDOW_DAYS : 0;
}

export function toDuplicateView(duplicate: ProbableDuplicate, createdLabel: string): DuplicateView {
  return {
    id: duplicate.id,
    summary: duplicate.summary,
    createdLabel,
    mergeable: duplicate.mergeable,
  };
}

/**
 * A `My requests` row.
 *
 * Returns null for a status this build cannot name. Dropping the row is the
 * wrong answer for a record and the right one for a list: the Customer would
 * otherwise get an entry with no state, no explanation and no next step, which
 * is worse than the request appearing once the app is updated. The caller
 * counts what it dropped.
 */
export function toRequestRow(summary: RequirementSummary, title: string): RequestRowView | null {
  if (!isRequestStatus(summary.status)) return null;
  return {
    id: summary.id,
    title,
    status: summary.status,
    // Published non-nullable on the summary and nullable on the submit
    // projection, because a service area with no open hours carries no
    // delivery promise at all. Read defensively: a row whose deadline is
    // missing must render as "no promise", never as "the promise is now".
    deadlineAt: summary.quote_delivery_deadline_at ?? null,
    serviceBy: summary.service_by,
    teaserCount: summary.teaser_count,
    closure: toClosureReason(summary.closure_reason),
    lastActivityAt: summary.last_activity_at ?? null,
    lifecycleExplanation: summary.lifecycle_explanation,
  };
}

export function toRequestRows(
  summaries: readonly RequirementSummary[],
  titleFor: (summary: RequirementSummary) => string,
): readonly RequestRowView[] {
  return summaries
    .map((summary) => toRequestRow(summary, titleFor(summary)))
    .filter((row): row is RequestRowView => row !== null);
}

/**
 * The detail header, from the record the detail endpoint actually returns.
 *
 * `GET /requirements/{id}/` answers with `RequirementDraft`, and a draft is the
 * *record* rather than the *tracking projection*: it has no teaser count, no
 * quote-delivery deadline and no closure reason. Those three are on
 * `RequirementSummary`, which only the list read returns.
 *
 * So they are `null` and `0` here, and that is the honest reading rather than a
 * gap papered over. The consequence is visible and deliberate: on a direct
 * navigation to `/requests/{id}` the header shows the state and the lifecycle
 * sentence and **no countdown and no quote count**, because nothing on that
 * response says what they are. Filling them from the list cache would show a
 * deadline read at some earlier moment as though it had just been confirmed —
 * on the one screen whose entire job is to be truthful about a promise with a
 * clock on it.
 *
 * Requesting the tracking fields on the detail projection is logged in the
 * execution plan §7. When they land, this function collapses into
 * `toRequestRow`.
 */
export function toRequestHeader(draft: RequirementDraft, title: string): RequestRowView | null {
  if (!isRequestStatus(draft.status)) return null;
  return {
    id: draft.id,
    title,
    status: draft.status,
    deadlineAt: null,
    serviceBy: draft.service_by,
    teaserCount: 0,
    closure: null,
    lastActivityAt: null,
    lifecycleExplanation: draft.lifecycle_explanation,
  };
}

/* --------------------------------------------------------------------------
   Timeline — `M2-FE-214`
   -------------------------------------------------------------------------- */

/**
 * A timeline row, with everything the view is allowed to render.
 *
 * `type` is nullable, and that is the point: a new event type the build does
 * not recognise renders as a neutral dated row rather than being dropped. An
 * unexplained gap in a record both parties rely on during a dispute is worse
 * than an unstyled entry.
 */
export interface TimelineEventView {
  id: string;
  at: string;
  /** Null when this build does not recognise the server's event type. */
  type: TimelineEventKind | null;
  /**
   * The detail fields the view may show, already filtered.
   *
   * See `DETAIL_ALLOWLIST`. Everything else on the wire is dropped here.
   */
  detail: Readonly<Record<string, string | number>>;
}

/**
 * The only `detail` keys that may reach the DOM, per event type.
 *
 * **This is the privacy rule, enforced rather than trusted.** `M2-FE-214`
 * requires invitations at an *aggregate level*: the Customer sees that five
 * professionals were invited, never which five, because pre-unlock vendor
 * identity is the thing the entire teaser design exists to withhold.
 *
 * The serializer is supposed to withhold it too. An allowlist here means that if
 * it ever stops — a new field, a debug flag, an Operations serializer reused by
 * mistake — the extra field is dropped by this build rather than rendered by it.
 * A denylist would have the opposite failure mode: safe until somebody adds a
 * key nobody thought to ban.
 *
 * `MATCHING_WAVE_SENT` therefore permits exactly one key, and it is a count.
 *
 * ## What the re-point changed
 *
 * `REQUIREMENT_CLOSED` permitted `closure_reason`; `selectors._transition_events`
 * sends `reason_code`. The allowlist was silently dropping the one field that
 * says *why* a request closed — the exact distinction `M2-FE-215` is built on —
 * and nothing failed, because dropping is what an allowlist does. `QUESTION_*`
 * still permits only `body`: the `question_id` beside it on the wire addresses a
 * clarification thread that is Wave A2's, and a timeline has nowhere to send it.
 * `SITE_VISIT_REQUESTED` permits `fee_paise` because a site visit is the one
 * pre-unlock thing that can cost money, and a row that hides the fee is the
 * screen deciding not to mention a charge.
 */
const DETAIL_ALLOWLIST: Record<TimelineEventKind, readonly string[]> = {
  REQUIREMENT_SUBMITTED: [],
  REQUIREMENT_EDITED: [],
  MATCHING_WAVE_SENT: ["vendors_invited"],
  QUESTION_ASKED: ["body"],
  QUESTION_ANSWERED: ["body"],
  SITE_VISIT_REQUESTED: ["fee_paise"],
  SITE_VISIT_SCHEDULED: ["scheduled_for"],
  QUOTE_RECEIVED: [],
  SLA_BREACHED: [],
  REQUIREMENT_CLOSED: ["reason_code"],
};

function permittedDetail(
  type: TimelineEventKind | null,
  detail: unknown,
): Readonly<Record<string, string | number>> {
  // An unrecognised type gets no detail at all. The row still renders — the
  // record must not have a hole in it — but this build cannot know which of an
  // unknown event's fields are safe to print, and guessing is how an identity
  // leaks through a type nobody has reviewed.
  if (type === null) return {};
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return {};

  const source = detail as Record<string, unknown>;
  const permitted: Record<string, string | number> = {};
  for (const key of DETAIL_ALLOWLIST[type]) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "number") permitted[key] = value;
  }
  return permitted;
}

export function toTimelineEvent(event: RequirementTimelineEvent): TimelineEventView {
  const type = isTimelineEventKind(event.type) ? event.type : null;
  return { id: event.id, at: event.at, type, detail: permittedDetail(type, event.detail) };
}

/**
 * The request timeline, oldest first.
 *
 * Sorted here rather than trusted from the wire, because the component renders
 * "what happened, in order" and an out-of-order record reads as a different
 * story — a quote arriving before the invitation that produced it. The sort is
 * stable on `at`, so events sharing an instant keep the server's ordering, which
 * is the only thing that can break the tie correctly.
 */
export function toTimelineEvents(timeline: RequirementTimeline): readonly TimelineEventView[] {
  return [...timeline.events]
    .sort((left, right) => left.at.localeCompare(right.at))
    .map(toTimelineEvent);
}

/* --------------------------------------------------------------------------
   Attachments
   -------------------------------------------------------------------------- */

const DRAFT_ATTACHMENT_KIND: Record<DraftAttachment["kind"], AttachmentKind> = {
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  DOCUMENT: "document",
  VOICE_NOTE: "audio",
};

/** Which of the reducer's kinds a wire kind is. Unknown reads as a document. */
const DRAFT_KIND_FOR_WIRE: Record<string, DraftAttachment["kind"]> = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  AUDIO: "AUDIO",
  VOICE_NOTE: "VOICE_NOTE",
  DOCUMENT: "DOCUMENT",
};

const ATTACHMENT_NOUN: Record<string, string> = {
  IMAGE: "Photo",
  VIDEO: "Video",
  AUDIO: "Audio",
  VOICE_NOTE: "Voice note",
  DOCUMENT: "Document",
};

/**
 * Why a file was not attached, in words the Customer can act on.
 *
 * Takes the kind because the two size sentences a Customer needs are different
 * numbers — a 20 MB PDF is fine and a 20 MB photograph is an unresized camera
 * dump — and "this file is too large" without the limit is the message that
 * makes somebody try the same file twice.
 *
 * The last three lines are where the whole `INFECTED`/`FAILED` split becomes
 * visible to a person. `CHECK_FAILED` ends with "try it again" because that is
 * the recovery; `INFECTED` says the opposite in as many words, because the row
 * next to it deliberately offers no retry and a Customer left guessing why will
 * re-upload the file through a different route.
 */
function failureCopy(failure: AttachmentFailure, kind: DraftAttachment["kind"]): string {
  switch (failure) {
    case "EMPTY":
      return "That file is empty, so there was nothing to send.";
    case "TOO_LARGE": {
      const ceiling = maximumSizeFor(kind);
      return ceiling === null
        ? "This file is larger than we can accept."
        : `This file is larger than the ${formatBytes(ceiling)} we can accept for a ${
            ATTACHMENT_NOUN[kind]?.toLowerCase() ?? "file"
          }.`;
    }
    case "UNSUPPORTED_TYPE":
      return "We cannot read this kind of file. Photos (JPEG, PNG, HEIC), video (MP4, MOV) and PDFs all work.";
    case "TOO_MANY":
      return `You can attach up to ${MAXIMUM_ATTACHMENTS} files. Remove one to make room for this.`;
    case "UPLOAD_FAILED":
      return "The upload did not finish, so this was not attached.";
    case "REFUSED":
      return "We could not accept this file, so it was not attached.";
    case "CHECK_FAILED":
      return "What arrived did not match what your device sent, so this was not attached. Try it again.";
    case "INFECTED":
      return "This file did not pass our security check, so it was not attached and no professional has seen it. Sending it again will not help — remove it, and try a different file.";
    case "SCAN_UNKNOWN":
      return "We could not confirm this file is safe, so it was not attached. Remove it and try a different file.";
    default:
      return "This file was not attached.";
  }
}

/* --------------------------------------------------------------------------
   The scan verdict — the one mapping the uploader turns on
   -------------------------------------------------------------------------- */

interface ScanOutcome {
  state: "scanning" | "attached" | "failed";
  failure: AttachmentFailure | null;
}

/**
 * What a `scan_status` means for the row on screen.
 *
 * | Wire | Row | Retry offered |
 * |---|---|---|
 * | `PENDING` | `scanning` — uploaded, not yet usable | n/a |
 * | `VERIFIED` | `attached` | n/a |
 * | `FAILED` | `failed` + `CHECK_FAILED` | **yes** — a checksum or size mismatch is the upload going wrong |
 * | `INFECTED` | `failed` + `INFECTED` | **no** — malware; removal is the only recovery |
 * | anything else | `failed` + `SCAN_UNKNOWN` | **no** — fails closed |
 *
 * `PENDING` is deliberately not `attached`. A file that has not cleared its scan
 * is not attached: `matching.snapshot_requirement` will not show it to a vendor,
 * and a Customer submitting in the belief that a photograph went with the
 * request is precisely the harm the third state exists to prevent.
 *
 * The unknown branch fails closed for the reason `readScanStatus` documents: a
 * verdict this bundle does not recognise could be `INFECTED` under a name it
 * predates, and treating it as usable is the only outcome that cannot be walked
 * back.
 */
export function toScanOutcome(scanStatus: string): ScanOutcome {
  switch (readScanStatus(scanStatus)) {
    case "VERIFIED":
      return { state: "attached", failure: null };
    case "PENDING":
      return { state: "scanning", failure: null };
    case "FAILED":
      return { state: "failed", failure: "CHECK_FAILED" };
    case "INFECTED":
      return { state: "failed", failure: "INFECTED" };
    default:
      return { state: "failed", failure: "SCAN_UNKNOWN" };
  }
}

/**
 * The server's attachment records, ready for `SYNC_SERVER_ATTACHMENTS`.
 *
 * The wire carries **no `file_name` at all**, which is why `fallbackName` is a
 * noun rather than a name: a stored attachment is described by what it is, and
 * inventing "document-3.pdf" would be worse than saying "Document". A local row
 * that uploaded the file keeps the real name; this is what is left when none
 * does.
 */
export function toServerAttachments(
  attachments: readonly RequirementAttachment[],
): ServerAttachment[] {
  return attachments.map((attachment) => {
    const outcome = toScanOutcome(attachment.scan_status);
    return {
      attachmentId: attachment.id,
      kind: DRAFT_KIND_FOR_WIRE[attachment.kind] ?? "DOCUMENT",
      fallbackName: ATTACHMENT_NOUN[attachment.kind] ?? "Attachment",
      byteSize: attachment.size_bytes,
      language: attachment.language === "" ? null : attachment.language,
      state: outcome.state,
      failure: outcome.failure,
    };
  });
}

/* --------------------------------------------------------------------------
   Rows
   -------------------------------------------------------------------------- */

/**
 * One attachment as the uploader renders it.
 *
 * Richer than the shared `Attachment` in `packages/ui` in exactly one way that
 * matters: **`canRetry` is per row.** `AttachmentList` takes a single `onRetry`
 * for the whole list and shows "Try again" on every failed row, which is the one
 * shape this feature cannot use — a malware verdict must never carry a retry
 * affordance while a checksum mismatch must. Requesting that flag on the shared
 * component is logged in the execution plan §7; until it lands the uploader
 * renders its own rows and the shared list keeps every other caller.
 */
export interface AttachmentRowView {
  id: string;
  /** The server's id, when the finalize returned one. Null before that. */
  attachmentId: string | null;
  name: string;
  kind: AttachmentKind;
  /** What the row is doing. `checking` is neither attached nor failed. */
  status: "uploading" | "checking" | "attached" | "failed";
  size: string;
  /** 0–100 while bytes are moving. Null while hashing or waiting on the server. */
  progress: number | null;
  /** Null unless the row failed. */
  error: string | null;
  canRetry: boolean;
  /** The language a voice note was recorded in. Null for everything else. */
  language: string | null;
}

const ROW_STATUS: Record<DraftAttachment["state"], AttachmentRowView["status"]> = {
  queued: "uploading",
  uploading: "uploading",
  scanning: "checking",
  attached: "attached",
  failed: "failed",
};

export function toAttachmentRows(attachments: readonly DraftAttachment[]): AttachmentRowView[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    attachmentId: attachment.attachmentId,
    name: attachment.fileName,
    kind: DRAFT_ATTACHMENT_KIND[attachment.kind],
    status: ROW_STATUS[attachment.state],
    size: formatBytes(attachment.byteSize),
    progress: attachment.progress,
    // The server's sentence wins where it gave one — see `failureDetail`. Our
    // copy is better only for the refusals we decided ourselves, because those
    // are the ones we can quote a ceiling for.
    error:
      attachment.failure === null
        ? null
        : (attachment.failureDetail ?? failureCopy(attachment.failure, attachment.kind)),
    canRetry: attachment.state === "failed" && isRetryableAttachmentFailure(attachment.failure),
    language: attachment.language,
  }));
}

/**
 * Attachments the server holds, as rows, for a requirement that has left the
 * four-screen flow.
 *
 * Used on the request detail, where there is no local row for anything and the
 * only affordance that can ever be offered is removal — `DELETE` is refused
 * once the requirement leaves `DRAFT` **except** for an `INFECTED` attachment,
 * which is removable in any status so that malware is never stuck on a live
 * requirement.
 */
export function toServerAttachmentRows(
  attachments: readonly RequirementAttachment[],
): AttachmentRowView[] {
  return toServerAttachments(attachments).map((record) => ({
    id: record.attachmentId,
    attachmentId: record.attachmentId,
    name: record.fallbackName,
    kind: DRAFT_ATTACHMENT_KIND[record.kind],
    status: record.state === "scanning" ? "checking" : record.state,
    size: formatBytes(record.byteSize),
    progress: null,
    error: record.failure === null ? null : failureCopy(record.failure, record.kind),
    // Never, on this surface. A retry needs the bytes, and a page that only read
    // the record does not have them.
    canRetry: false,
    language: record.language,
  }));
}

/**
 * Draft attachments as the shared `AttachmentList` renders them.
 *
 * Kept for the read-only callers that do not need a per-row retry decision.
 * `scanning` maps to `uploading` rather than to `attached`: the file has left the
 * device but is not yet usable, and showing it as attached would let a Customer
 * submit believing a photo is present that the scan may still reject.
 */
export function toAttachmentItems(attachments: readonly DraftAttachment[]): Attachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.fileName,
    kind: DRAFT_ATTACHMENT_KIND[attachment.kind],
    status:
      attachment.state === "attached"
        ? "attached"
        : attachment.state === "failed"
          ? "failed"
          : "uploading",
    size: formatBytes(attachment.byteSize),
    progress: attachment.progress ?? undefined,
    error:
      attachment.failure === null
        ? undefined
        : failureCopy(attachment.failure, attachment.kind),
  }));
}

/**
 * Attachments the server already holds, as the same shared list renders them.
 *
 * Two mappings rather than one, because the two inputs describe different
 * things: a `DraftAttachment` is a file leaving this device and carries a name,
 * a progress percentage and a local failure; a `RequirementAttachment` is a
 * stored record and carries `size_bytes`, a scan verdict and **no file name at
 * all**. Folding them together would mean inventing one of those halves.
 *
 * `PENDING` renders as `uploading` for the same reason `scanning` does above:
 * the file is on the server and not yet usable, and the honest word for that on
 * a progress list is "still working", not "done". Anything the scan vocabulary
 * does not cover renders as failed rather than as attached — see
 * `toScanOutcome`, which owns that decision for every caller.
 */
export function toServerAttachmentItems(
  attachments: readonly RequirementAttachment[],
): Attachment[] {
  return toServerAttachments(attachments).map((record) => ({
    id: record.attachmentId,
    // The wire carries no file name. A generic noun is not a placeholder for
    // one — it is the whole truth the record contains, and inventing
    // "document-3.pdf" would be worse than saying "Document".
    name: record.fallbackName,
    kind: DRAFT_ATTACHMENT_KIND[record.kind],
    status: record.state === "attached" ? "attached" : record.state === "failed" ? "failed" : "uploading",
    size: formatBytes(record.byteSize),
    error: record.failure === null ? undefined : failureCopy(record.failure, record.kind),
  }));
}
