import type { Schemas } from "@vsolve/api-client";
import type {
  ProbableDuplicate,
  RequirementAttachment,
  RequirementDraft,
  RequirementSummary,
  RequirementTimeline,
  RequirementTimelineEvent,
} from "@vsolve/query";
import type { Attachment, AttachmentKind } from "@vsolve/ui";

import type { RequestClosureReason, RequestStatus } from "../model/request-state";
import { isTimelineEventKind, type TimelineEventKind } from "../model/timeline";
import type { DraftAttachment, LifecycleVerdict } from "../model/state";

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
 * | `ScanStatus: "CLEAN" \| "INFECTED"` | `"VERIFIED"`, and no `INFECTED` | `toServerAttachmentItems` |
 *
 * Three shapes the handover note did not mention differed too, and they are
 * absorbed here for the same reason: `answers` and `detail` arrive as `unknown`
 * rather than as records, `status`/`closure_reason`/`inferred_lifecycle` arrive
 * as bare `string` rather than as the enums the schema also declares, and the
 * attachment carries `size_bytes` with no `file_name` at all.
 */

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
  DOCUMENT: "document",
  VOICE_NOTE: "audio",
};

/** The five the server can send back, which is one more than a file picker produces. */
const SERVER_ATTACHMENT_KIND: Record<string, AttachmentKind> = {
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  VOICE_NOTE: "audio",
  DOCUMENT: "document",
};

const FAILURE_COPY: Record<NonNullable<DraftAttachment["failure"]>, string> = {
  TOO_LARGE: "This file is too large.",
  UNSUPPORTED_TYPE: "We cannot read this kind of file.",
  SCAN_FAILED: "This file did not pass our security check and was not attached.",
  UPLOAD_FAILED: "The upload did not finish.",
};

/** Bytes as a short human string. Approximate on purpose — this is a hint, not an audit. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Draft attachments as the shared `AttachmentList` renders them.
 *
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
    size: formatSize(attachment.byteSize),
    progress: attachment.progress ?? undefined,
    error: attachment.failure === null ? undefined : FAILURE_COPY[attachment.failure],
  }));
}

/**
 * Attachments the server already holds, as the same list renders them.
 *
 * Two mappings rather than one, because the two inputs describe different
 * things: a `DraftAttachment` is a file leaving this device and carries a name,
 * a progress percentage and a local failure; a `RequirementAttachment` is a
 * stored record and carries `size_bytes`, a scan verdict and **no file name at
 * all**. Folding them together would mean inventing one of those halves.
 *
 * `PENDING` renders as `uploading` for the same reason `scanning` does above:
 * the file is on the server and not yet usable, and the honest word for that on
 * a progress list is "still working", not "done".
 *
 * There is no `INFECTED`. The published states are `PENDING | VERIFIED |
 * FAILED`, so a file that did not pass renders as failed without a claim about
 * why — and anything unrecognised also renders as failed rather than as
 * attached, because failing an unknown scan state *closed* is the only
 * direction that cannot put an unscanned file in front of a vendor.
 */
export function toServerAttachmentItems(
  attachments: readonly RequirementAttachment[],
): Attachment[] {
  return attachments.map((attachment) => {
    const failed = attachment.scan_status !== "PENDING" && attachment.scan_status !== "VERIFIED";
    return {
      id: attachment.id,
      // The wire carries no file name. A generic noun is not a placeholder for
      // one — it is the whole truth the record contains, and inventing
      // "document-3.pdf" would be worse than saying "Document".
      name: ATTACHMENT_NOUN[attachment.kind] ?? "Attachment",
      kind: SERVER_ATTACHMENT_KIND[attachment.kind] ?? "document",
      status: failed ? "failed" : attachment.scan_status === "VERIFIED" ? "attached" : "uploading",
      size: formatSize(attachment.size_bytes),
      error: failed ? FAILURE_COPY.SCAN_FAILED : undefined,
    };
  });
}

const ATTACHMENT_NOUN: Record<string, string> = {
  IMAGE: "Photo",
  VIDEO: "Video",
  AUDIO: "Audio",
  VOICE_NOTE: "Voice note",
  DOCUMENT: "Document",
};
