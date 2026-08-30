import {
  activeStage,
  amendmentDirection,
  appliedAmendments,
  autoApprovalDeadline,
  canAcceptCompletion,
  canApproveStage,
  canDisputeStage,
  canReportCashDemand,
  canRequestCorrection,
  completionBlocker,
  disputedStages,
  eventsOldestFirst,
  isAmendmentApplied,
  isAmendmentAwaitingPayment,
  isAmendmentDecidable,
  isEngagementDisputed,
  isEvidenceReadable,
  isKnownAmendmentKind,
  isKnownAmendmentStatus,
  isKnownCommercialMode,
  isLeadOnly,
  stageKind,
  nextCustomerAction,
  nextFundableStage,
  orderedStages,
  payoutReleaseDeadline,
  reviewClock,
  stageProgress,
  type AmendmentDirection,
  type CompletionBlocker,
  type CustomerNextAction,
  type Engagement,
  type EngagementAmendment,
  type EngagementAmendmentList,
  type EngagementCommercialMode,
  type EngagementEventList,
  type EngagementStage,
  type ReviewClock,
  type StageEvidence,
  type StageEvidenceKind,
  type StageKind,
} from "@vsolve/query";
import { formatMoney } from "@vsolve/ui";

/**
 * The engagement wire, turned into something a screen can render.
 *
 * Same layering as the other four features. Two judgements are load-bearing:
 *
 * **`commercial_mode` is carried through as a decided fact, not a string.**
 * `mode` below is a closed union with an `unknown` member, so a screen cannot
 * fall through to the optimistic reading of a mode this build has never heard of
 * — and on this surface the optimistic reading is "protected booking", which is
 * the one claim M2 must not make wrongly.
 *
 * **Money is read, never re-added.** 1.25.0 publishes six running totals on the
 * engagement and four per stage. Nothing below sums a stage array to produce a
 * total; `staged_total_paise = total_paise + amendment_delta_paise` is a database
 * constraint, so "agreed, then changed by, now owed" is three published numbers
 * rather than a subtraction this client could get wrong in a dispute.
 */

export type EngagementMode = "lead_only" | "managed" | "unknown";

/* --------------------------------------------------------------------------
   Dates
   -------------------------------------------------------------------------- */

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** A server instant, as a person reads it. Null in, null out — never "Invalid Date". */
export function formatInstant(iso: string | null): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : DATE_TIME_FORMAT.format(at);
}

/** A calendar day — a shift-day or a milestone date, which carry no time. */
export function formatDay(isoDate: string | null): string | null {
  if (isoDate === null) return null;
  const at = new Date(isoDate);
  return Number.isNaN(at.getTime()) ? null : DATE_FORMAT.format(at);
}

/* --------------------------------------------------------------------------
   Stage evidence — `M2-FE-609`
   -------------------------------------------------------------------------- */

export interface EvidenceView {
  evidenceId: string;
  kind: StageEvidenceKind;
  /** The vendor's own words. Blank is a real state on a file-only row. */
  note: string | null;
  /** Present only on an uploaded file; a `NOTE` row carries no bytes. */
  sizeBytes: number | null;
  contentType: string | null;
  /**
   * Whether the file has been scanned and cleared.
   *
   * `PENDING` means the checksum matched and the safety question is unanswered —
   * two different questions, deliberately. Anything unrecognised fails closed.
   */
  isReadable: boolean;
  scanStatus: StageEvidence["processing_status"];
  failureReason: string | null;
  submittedAt: string | null;
}

export function toEvidenceView(evidence: StageEvidence): EvidenceView {
  const isFile = evidence.kind !== "NOTE";
  return {
    evidenceId: evidence.id,
    kind: evidence.kind,
    note: evidence.note.trim() === "" ? null : evidence.note,
    sizeBytes: isFile ? evidence.size_bytes : null,
    contentType: isFile && evidence.content_type.trim() !== "" ? evidence.content_type : null,
    isReadable: isEvidenceReadable(evidence),
    scanStatus: evidence.processing_status,
    failureReason: evidence.failure_reason.trim() === "" ? null : evidence.failure_reason,
    submittedAt: formatInstant(evidence.created_at),
  };
}

/* --------------------------------------------------------------------------
   Stages
   -------------------------------------------------------------------------- */

export interface StageView {
  stageId: string;
  position: number;
  label: string;
  /**
   * What this row's money is for — contract 1.26.0.
   *
   * `work` is a shift-day or a milestone somebody performs. `material_advance`
   * is money spent on goods, which is not recovered like unearned work if the
   * project ends early — so it may never be described as an ordinary fundable
   * milestone. `unknown` fails closed: no funding control and no claim about
   * what the money does.
   */
  kind: StageKind;
  amountPaise: number;
  amountLabel: string;
  /** The calendar day this stage is for, when the agreement named one. */
  scheduledOn: string | null;
  status: EngagementStage["status"];
  fundingState: EngagementStage["funding_state"];
  /** True for the one stage the Customer is being asked to fund now. */
  isNextToFund: boolean;
  /** True while a funding charge on this stage is unresolved. */
  isFundingPending: boolean;

  /** The four published money numbers, formatted. Never summed here. */
  fundedLabel: string;
  approvedLabel: string;
  releasedLabel: string;
  refundedLabel: string;
  hasRefund: boolean;

  /**
   * What the review deadline means, as a decided state rather than a nullable
   * date. `no_deadline` is a policy state — nothing auto-approves — and must
   * never render as time in hand.
   */
  clock: ReviewClock;
  /**
   * The raw instant silence approves this stage at, or null.
   *
   * Raw rather than formatted because `useServerCountdown` measures against the
   * **server's** clock and takes an ISO string; handing it a formatted date
   * would be handing it the device's reading of the deadline.
   */
  autoApprovalDeadline: string | null;
  /** The same instant, as a person reads it. Null for the same three reasons. */
  autoApprovalDeadlineLabel: string | null;
  /** Non-null only when a payout hold is configured on a managed engagement. */
  payoutReleaseDeadline: string | null;
  payoutReleaseDeadlineLabel: string | null;

  canApprove: boolean;
  canRequestCorrection: boolean;
  canDispute: boolean;

  /** What the Customer asked for last time, when they sent this stage back. */
  correctionNote: string | null;
  /** The server's own reason code for an open dispute. Carried verbatim. */
  disputeReasonCode: string | null;

  evidence: readonly EvidenceView[];
  evidenceSubmittedAt: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  disputedAt: string | null;

  /**
   * Where this shift-day has got to, on the engagement read itself — contract
   * 1.49.0. Null on a project milestone and on records older than the field.
   */
  shiftSummary: ShiftSummaryView | null;
}

/* --------------------------------------------------------------------------
   Shift-day summary and the day chip — contract 1.49.0
   -------------------------------------------------------------------------- */

/**
 * One shift-day's state in a word or two, for the day chips.
 *
 * The same derivation the Partner app uses, read from the same published
 * fields, so both sides of a booking see the same day in the same state. The
 * checks run from the most settled fact backwards: a settled day is "Paid"
 * whatever the attendance row says, and a disputed count outranks anything
 * short of settlement.
 */
export type ShiftDayChipState =
  | "crew_not_named"
  | "crew_named"
  | "reached"
  | "confirm_count"
  | "pay_today"
  | "confirm_paid"
  | "waiting_on_them"
  | "paid"
  | "disputed";

export interface ShiftSummaryView {
  crewNamed: number;
  expectedCount: number;
  arrivedAt: string | null;
  presentCount: number | null;
  attendanceStatus: string;
  settlementStatus: string;
  settlementAmountLabel: string | null;
  shortfallChoice: string | null;
  /** The chip, decided here so no screen re-derives it. */
  chip: { state: ShiftDayChipState; label: string; needsYou: boolean };
}

function toShiftSummaryView(
  summary: NonNullable<EngagementStage["shift_summary"]>,
): ShiftSummaryView {
  const amountLabel =
    summary.settlement_amount_paise === null ? null : formatMoney(summary.settlement_amount_paise);
  const count = `${summary.present_count ?? 0} of ${summary.expected_count}`;

  let chip: ShiftSummaryView["chip"];
  if (summary.settlement_status === "SETTLED") {
    chip = {
      state: "paid",
      label: amountLabel === null ? "Paid ✓" : `Paid ✓ ${amountLabel}`,
      needsYou: false,
    };
  } else if (summary.attendance_status === "DISPUTED") {
    chip = { state: "disputed", label: "Count disputed", needsYou: false };
  } else if (summary.settlement_status === "CUSTOMER_CLAIMED") {
    chip = { state: "waiting_on_them", label: "You said paid · waiting for them", needsYou: false };
  } else if (summary.settlement_status === "SUPERVISOR_CLAIMED") {
    chip = { state: "confirm_paid", label: "Confirm you paid", needsYou: true };
  } else if (summary.attendance_status === "CUSTOMER_CONFIRMED") {
    chip = { state: "pay_today", label: `${count} · pay today`, needsYou: true };
  } else if (summary.attendance_status === "SUPERVISOR_CONFIRMED") {
    chip = { state: "confirm_count", label: `${count} · confirm`, needsYou: true };
  } else if (summary.arrived_at !== null) {
    chip = { state: "reached", label: "Reached", needsYou: false };
  } else if (summary.crew_named > 0) {
    chip = { state: "crew_named", label: "Who is coming", needsYou: false };
  } else {
    chip = { state: "crew_not_named", label: "Crew not named yet", needsYou: false };
  }

  return {
    crewNamed: summary.crew_named,
    expectedCount: summary.expected_count,
    arrivedAt: formatInstant(summary.arrived_at),
    presentCount: summary.present_count,
    attendanceStatus: summary.attendance_status,
    settlementStatus: summary.settlement_status,
    settlementAmountLabel: amountLabel,
    shortfallChoice: summary.shortfall_choice.trim() === "" ? null : summary.shortfall_choice,
    chip,
  };
}

function toStageView(stage: EngagementStage, nextFundableStageId: string | null): StageView {
  return {
    stageId: stage.id,
    position: stage.position,
    // A stage stored with no label still has a position, and "Stage 2" is a
    // truthful name for it. An empty heading is not.
    label: stage.label.trim() === "" ? `Stage ${stage.position}` : stage.label,
    kind: stageKind(stage),
    amountPaise: stage.amount_paise,
    amountLabel: formatMoney(stage.amount_paise),
    scheduledOn: formatDay(stage.scheduled_on),
    status: stage.status,
    fundingState: stage.funding_state,
    isNextToFund: nextFundableStageId === stage.id,
    isFundingPending: stage.funding_state === "PENDING",

    fundedLabel: formatMoney(stage.funded_paise),
    approvedLabel: formatMoney(stage.approved_amount_paise),
    releasedLabel: formatMoney(stage.released_amount_paise),
    refundedLabel: formatMoney(stage.refunded_amount_paise),
    hasRefund: stage.refunded_amount_paise > 0,

    clock: reviewClock(stage),
    autoApprovalDeadline: autoApprovalDeadline(stage),
    autoApprovalDeadlineLabel: formatInstant(autoApprovalDeadline(stage)),
    payoutReleaseDeadline: payoutReleaseDeadline(stage),
    payoutReleaseDeadlineLabel: formatInstant(payoutReleaseDeadline(stage)),

    canApprove: canApproveStage(stage),
    canRequestCorrection: canRequestCorrection(stage),
    canDispute: canDisputeStage(stage),

    correctionNote: stage.correction_note.trim() === "" ? null : stage.correction_note,
    disputeReasonCode: stage.dispute_reason_code.trim() === "" ? null : stage.dispute_reason_code,

    evidence: stage.evidence.map(toEvidenceView),
    evidenceSubmittedAt: formatInstant(stage.evidence_submitted_at),
    approvedAt: formatInstant(stage.approved_at),
    releasedAt: formatInstant(stage.released_at),
    disputedAt: formatInstant(stage.disputed_at),

    // `== null`: a record older than 1.49.0 has no field at all.
    shiftSummary: stage.shift_summary == null ? null : toShiftSummaryView(stage.shift_summary),
  };
}

/**
 * One stage read from its own route, where no engagement is in hand yet.
 *
 * `isNextToFund` is false by construction: funding order is a property of the
 * whole agreement and a single stage cannot know whether an earlier one is
 * unfunded. The stage review does not offer funding, so nothing is lost.
 */
export function toStandaloneStageView(stage: EngagementStage): StageView {
  return toStageView(stage, null);
}

/* --------------------------------------------------------------------------
   The access fee's receipt — `M2-FE-418`, published at 1.26.0
   -------------------------------------------------------------------------- */

/**
 * The durable reference for the access fee this agreement grew out of.
 *
 * **A reference, not a document.** `AccessReceipt` is
 * `{kind, number, series, sequence, amount_paise}` — there is no URL and no
 * `TaxDocument` id, because `TaxDocument.order` is not nullable and an access
 * fee has no `Order`. So the screen shows the number a Customer quotes to
 * support; it does not offer a download, and it does not call it an invoice —
 * GST treatment of both access fees is still an open owner decision.
 *
 * `number` is formatted server-side in the `series-sequence` shape, deliberately
 * so that every app quotes the same string. It is carried through verbatim and
 * never re-assembled here from `series` and `sequence`.
 */
export interface AccessReceiptView {
  /** The `M2A-` number, exactly as the server formatted it. */
  number: string;
  /** What was paid for: the booking fee, the A3 unlock, or the A5 visit plan. */
  purpose: string;
  amountLabel: string;
  /**
   * When the payment was verified, already formatted. Null on a row that
   * predates the stamp — rendered conditionally rather than defaulted, because a
   * receipt carrying today's date for a payment made last month is worse than a
   * receipt carrying none.
   */
  paidOn: string | null;
}

/**
 * The three kinds the server can produce.
 *
 * `A3_BOOKING_FEE` was missing here while the server had been publishing it
 * since revision 4, so every A3 crew booking rendered its receipt through the
 * de-slug fallback — "A3 booking fee", the wire's own constant, on the one line
 * of the receipt meant to say in plain words what the money bought.
 */
const ACCESS_RECEIPT_PURPOSE: Record<string, string> = {
  A3_BOOKING_FEE: "Booking your crew",
  A3_QUOTE_UNLOCK: "Seeing your quotes in full",
  A5_VISIT_PLAN: "Your site visits",
};

function toAccessReceiptView(engagement: Engagement): AccessReceiptView | null {
  const receipt = engagement.access_receipt;
  if (receipt === null) return null;
  return {
    number: receipt.number,
    // De-slugged rather than blank for a kind added later. `kind` is a plain
    // string on the wire, not a published enum, so a lookup miss is a real
    // possibility and an empty purpose line on a receipt is worse than the
    // server's own word for it.
    purpose: ACCESS_RECEIPT_PURPOSE[receipt.kind] ?? deSlug(receipt.kind),
    amountLabel: formatMoney(receipt.amount_paise),
    paidOn: formatInstant(receipt.paid_at ?? null),
  };
}

/* --------------------------------------------------------------------------
   A3 crew terms, contact and site — contract 1.49.0
   -------------------------------------------------------------------------- */

/**
 * The rate-card terms frozen on an A3 booking, formatted.
 *
 * Every figure is the server's. `per_worker_day × headcount × days` is read out
 * beside `lead_receipt` rather than multiplied into it: the Customer agreed to
 * the published total, and a product this client computed would be the number
 * that disagrees in a dispute.
 */
export interface CrewTermsView {
  headcount: number;
  days: number;
  perWorkerDayLabel: string;
  leadDayReceiptLabel: string;
  leadReceiptLabel: string;
  bookingFeeLabel: string;
  totalCustomerLabel: string;
  standardDayHours: number | null;
  overtimeHourlyLabel: string | null;
  addOnRates: readonly { code: string; label: string; amountLabel: string }[];
  inclusions: readonly string[];
}

export interface EngagementContactView {
  name: string;
  phone: string;
  /** `tel:` with the number, for a Call button. */
  telHref: string;
}

export interface SiteAddressView {
  line1: string;
  line2: string | null;
  landmark: string | null;
  locality: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  /** The non-empty parts joined, for a one-line address. */
  summary: string;
}

function toCrewTermsView(terms: NonNullable<Engagement["crew_terms"]>): CrewTermsView {
  return {
    headcount: terms.headcount,
    days: terms.days,
    perWorkerDayLabel: formatMoney(terms.per_worker_day_paise),
    leadDayReceiptLabel: formatMoney(terms.lead_day_receipt_paise),
    leadReceiptLabel: formatMoney(terms.lead_receipt_paise),
    bookingFeeLabel: formatMoney(terms.booking_fee_paise),
    totalCustomerLabel: formatMoney(terms.total_customer_paise),
    standardDayHours: terms.standard_day_hours,
    overtimeHourlyLabel:
      terms.overtime_hourly_paise === null ? null : formatMoney(terms.overtime_hourly_paise),
    addOnRates: Object.entries(terms.add_on_rates ?? {}).map(([code, paise]) => ({
      code,
      label: deSlug(code),
      amountLabel: formatMoney(paise),
    })),
    inclusions: (terms.inclusions ?? []).filter((line) => line.trim() !== ""),
  };
}

function toContactView(contact: Engagement["partner_contact"]): EngagementContactView | null {
  if (contact == null) return null;
  const name = contact.name.trim();
  const phone = contact.phone.trim();
  if (name === "" && phone === "") return null;
  return {
    name: name === "" ? "Your supervisor" : name,
    phone,
    telHref: `tel:${phone.replace(/\s+/g, "")}`,
  };
}

function toSiteAddressView(address: Engagement["site_address"]): SiteAddressView | null {
  if (address == null) return null;
  const blankToNull = (value: string): string | null =>
    value.trim() === "" ? null : value.trim();
  const parts = [
    address.line1,
    address.line2,
    address.landmark,
    address.locality,
    address.city,
    address.state,
    address.postal_code,
  ]
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) return null;
  return {
    line1: address.line1.trim(),
    line2: blankToNull(address.line2),
    landmark: blankToNull(address.landmark),
    locality: blankToNull(address.locality),
    city: address.city.trim(),
    state: blankToNull(address.state),
    postalCode: blankToNull(address.postal_code),
    summary: parts.join(", "),
  };
}

/* --------------------------------------------------------------------------
   The engagement
   -------------------------------------------------------------------------- */

export interface EngagementView {
  engagementId: string;
  /**
   * The request this came out of.
   *
   * Carried because the engagement route has no requirement in its path — a
   * Customer arriving from a notification months later holds an engagement id
   * and nothing else — and the full history still has to be one link away.
   */
  requirementId: string;
  /**
   * The catalogue's name for what was agreed — "Full home rewiring". Published
   * since 1.48.0; an older record without it reads as the mode noun.
   */
  serviceName: string | null;
  /** The catalogue slug for "book again" — `bookCrewHref`. Null when blank. */
  serviceSlug: string | null;
  mode: EngagementMode;
  commercialMode: EngagementCommercialMode | null;
  status: Engagement["status"];

  /** What was agreed at the start. Never moves, by design. */
  totalLabel: string;
  /** What the accepted amendments have added or removed since. */
  amendmentDeltaPaise: number;
  amendmentDeltaLabel: string;
  /** `total + delta`, by database constraint. Read, not computed. */
  stagedTotalLabel: string;
  stagedTotalPaise: number;
  taxLabel: string;
  /**
   * How platform commission is treated on this agreement.
   *
   * A free-text field with no published vocabulary, carried verbatim or null.
   * See `features/quotes/adapters` for why nothing here invents a code.
   */
  commissionTreatment: string | null;

  /** The four published running totals. */
  fundedTotalLabel: string;
  approvedTotalLabel: string;
  releasedTotalLabel: string;
  refundedTotalLabel: string;
  hasRefund: boolean;

  stages: readonly StageView[];
  /** Counted in stages, not in money — see `stageProgress`. */
  progress: { done: number; total: number };
  activeStageId: string | null;
  /** Null on A3, and on A5 whenever nothing is currently fundable. */
  nextFundableStageId: string | null;
  /**
   * What the next fundable row's money is for.
   *
   * Carried up to the list row and the progress panel because "fund the next
   * stage to start it" is the wrong sentence about a material advance — nothing
   * starts, goods get bought — and that is the one sentence a Customer reads
   * before they open anything.
   */
  nextFundableStageKind: StageKind | null;
  /** Every stage waiting on the Customer, earliest first. */
  stagesAwaitingReviewIds: readonly string[];
  disputedStageIds: readonly string[];
  isDisputed: boolean;
  nextAction: CustomerNextAction;
  canAcceptCompletion: boolean;
  /**
   * Why the final acceptance would be refused, or null — contract 1.31.0.
   *
   * Two of `m2_engagement_completion_accept`'s three refusals, in the order the
   * server checks them. The third — an unaccepted handover — lives on the
   * project read and reaches the panel separately.
   *
   * It exists so the screen can **explain** rather than offer a control that
   * answers `409`, and it is never read the other way: nothing here approves,
   * skips or sweeps a stage. An accepted amendment can append work after
   * `COMPLETING`, and that stage keeps its own review.
   */
  completionBlocker: CompletionBlocker;
  /**
   * Whether to offer the "they asked for extra in cash" report — `M2-FE-515`.
   *
   * `LEAD_ONLY` only, because the report's whole consequence is a standing event
   * against the lead and, past an owner-set threshold, suspension of their **A3
   * capability**. Deliberately not gated on the booking being live: somebody
   * asked for cash on Friday reports it on Saturday.
   */
  canReportCashDemand: boolean;

  /**
   * The access fee's receipt reference, or null — `M2-FE-418`.
   *
   * Null has three honest meanings and none of them is an error: no fee has
   * been charged yet, the plan was covered entirely by a reclassification
   * credit, or the row predates receipt numbering. All three mean the same
   * thing to the screen — there is no number to show.
   */
  accessReceipt: AccessReceiptView | null;

  /**
   * The frozen A3 rate-card terms — contract 1.49.0. Null on A5 and on any
   * record older than the field.
   */
  crewTerms: CrewTermsView | null;
  /** The supervisor's name and number. Null until contact is released. */
  partnerContact: EngagementContactView | null;
  /** Where the work is. Null until contact is released. */
  siteAddress: SiteAddressView | null;

  /** When contact may be exchanged. A3 at engagement creation; A5 at first funding. */
  contactReleasedAt: string | null;
  /** When work may begin, on the server's own record. */
  workMayStartAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

function toMode(engagement: Engagement): EngagementMode {
  if (!isKnownCommercialMode(engagement)) return "unknown";
  return isLeadOnly(engagement) ? "lead_only" : "managed";
}

export function toEngagementView(engagement: Engagement): EngagementView {
  const nextStage = nextFundableStage(engagement);
  const stages = orderedStages(engagement).map((stage) => toStageView(stage, nextStage?.id ?? null));
  const mode = toMode(engagement);

  return {
    engagementId: engagement.id,
    requirementId: engagement.requirement,
    serviceName: engagement.service_name?.trim() ? engagement.service_name.trim() : null,
    serviceSlug: engagement.service_slug?.trim() ? engagement.service_slug.trim() : null,
    mode,
    commercialMode: mode === "unknown" ? null : engagement.commercial_mode,
    status: engagement.status,

    totalLabel: formatMoney(engagement.total_paise),
    amendmentDeltaPaise: engagement.amendment_delta_paise,
    amendmentDeltaLabel: formatMoney(Math.abs(engagement.amendment_delta_paise)),
    stagedTotalLabel: formatMoney(engagement.staged_total_paise),
    stagedTotalPaise: engagement.staged_total_paise,
    taxLabel: formatMoney(engagement.tax_paise),
    commissionTreatment:
      engagement.commission_treatment.trim() === "" ? null : engagement.commission_treatment,

    fundedTotalLabel: formatMoney(engagement.funded_total_paise),
    approvedTotalLabel: formatMoney(engagement.approved_total_paise),
    releasedTotalLabel: formatMoney(engagement.released_total_paise),
    refundedTotalLabel: formatMoney(engagement.refunded_total_paise),
    hasRefund: engagement.refunded_total_paise > 0,

    stages,
    progress: stageProgress(engagement),
    activeStageId: activeStage(engagement)?.id ?? null,
    nextFundableStageId: nextStage?.id ?? null,
    nextFundableStageKind: nextStage === null ? null : stageKind(nextStage),
    stagesAwaitingReviewIds: stages
      .filter((stage) => stage.status === "AWAITING_REVIEW")
      .map((stage) => stage.stageId),
    disputedStageIds: disputedStages(engagement).map((stage) => stage.id),
    isDisputed: isEngagementDisputed(engagement),
    nextAction: nextCustomerAction(engagement),
    canAcceptCompletion: canAcceptCompletion(engagement),
    completionBlocker: completionBlocker(engagement),
    canReportCashDemand: canReportCashDemand(engagement),

    accessReceipt: toAccessReceiptView(engagement),

    crewTerms: engagement.crew_terms == null ? null : toCrewTermsView(engagement.crew_terms),
    partnerContact: toContactView(engagement.partner_contact),
    siteAddress: toSiteAddressView(engagement.site_address),

    contactReleasedAt: formatInstant(engagement.contact_released_at),
    workMayStartAt: formatInstant(engagement.work_may_start_at),
    completedAt: formatInstant(engagement.completed_at),
    createdAt: formatInstant(engagement.created_at),
  };
}

/* --------------------------------------------------------------------------
   The lists — `M2-FE-509` (A3) and `M2-FE-608` (A5)
   -------------------------------------------------------------------------- */

export interface EngagementRowView {
  engagementId: string;
  requirementId: string;
  /** "Full home rewiring", or null on a record that predates the field. */
  serviceName: string | null;
  mode: EngagementMode;
  status: Engagement["status"];
  /** The active stage's label, or null when every stage is settled. */
  activeStageLabel: string | null;
  /** The day the active stage is scheduled for, when it has one. */
  activeStageOn: string | null;
  progress: { done: number; total: number };
  stagedTotalLabel: string;
  fundedTotalLabel: string;
  nextAction: CustomerNextAction;
  /** The stage the next action is about, when it is about one. */
  actionStageId: string | null;
  /** That stage's kind, so the row's one sentence describes the right money. */
  actionStageKind: StageKind | null;
  isDisputed: boolean;
  createdAt: string | null;
}

function toRow(engagement: Engagement): EngagementRowView {
  const view = toEngagementView(engagement);
  const active = view.stages.find((stage) => stage.stageId === view.activeStageId) ?? null;

  const actionStageId =
    view.nextAction === "review_stage"
      ? (view.stagesAwaitingReviewIds[0] ?? null)
      : view.nextAction === "fund_stage"
        ? view.nextFundableStageId
        : view.nextAction === "awaiting_case"
          ? (view.disputedStageIds[0] ?? null)
          : null;

  return {
    engagementId: view.engagementId,
    requirementId: view.requirementId,
    serviceName: view.serviceName,
    mode: view.mode,
    status: view.status,
    activeStageLabel: active?.label ?? null,
    activeStageOn: active?.scheduledOn ?? null,
    progress: view.progress,
    stagedTotalLabel: view.stagedTotalLabel,
    fundedTotalLabel: view.fundedTotalLabel,
    nextAction: view.nextAction,
    actionStageId,
    actionStageKind:
      actionStageId === null
        ? null
        : (view.stages.find((stage) => stage.stageId === actionStageId)?.kind ?? null),
    isDisputed: view.isDisputed,
    createdAt: view.createdAt,
  };
}

/**
 * Splits the one published list into the two the two screens read.
 *
 * `GET /engagements/` returns every engagement the caller has, both archetypes.
 * The two lists are two different promises about who holds the money — that is
 * the whole reason they are separate screens with separate nouns — so the split
 * is on `commercial_mode` and **an engagement in a mode this build cannot
 * describe appears in neither**. It is not dropped silently: `unknown` is
 * returned beside them so the screens can say a record exists that they will not
 * guess about, which is the same rule `toRequestRow` learned the hard way when
 * `VISITS_BOOKED` made A5 requests vanish from `My requests`.
 */
export interface EngagementLists {
  workforce: readonly EngagementRowView[];
  projects: readonly EngagementRowView[];
  undescribable: readonly EngagementRowView[];
}

export function toEngagementLists(engagements: readonly Engagement[]): EngagementLists {
  const rows = engagements.map(toRow);
  return {
    workforce: rows.filter((row) => row.mode === "lead_only"),
    projects: rows.filter((row) => row.mode === "managed"),
    undescribable: rows.filter((row) => row.mode === "unknown"),
  };
}

/* --------------------------------------------------------------------------
   Amendments — `M2-FE-610`, `M2-FE-511`, `M2-FE-613`
   -------------------------------------------------------------------------- */

export interface AmendmentLineView {
  position: number;
  title: string;
  quantity: number;
  /** Absolute value, formatted. The sign is `removesScope`, not a minus glyph. */
  amountLabel: string;
  /** `amount_paise` is signed on the wire: negative removes scope. */
  removesScope: boolean;
  kind: string;
}

export interface AmendmentView {
  amendmentId: string;
  /** `TIME_EXTENSION` (A3) or `CHANGE_ORDER` (A5). Unknown kinds are flagged. */
  kind: string;
  isKnownKind: boolean;
  /** The raw wire status. `EngagementAmendment.status` is a string, not an enum. */
  status: string;
  isKnownStatus: boolean;
  /**
   * Whether this is still the Customer's to decide.
   *
   * The single most important field on this screen. Everything the view renders
   * as an action is gated on it, and it is false for every status this build
   * does not recognise.
   */
  isDecidable: boolean;
  isAwaitingPayment: boolean;
  isApplied: boolean;
  /** The vendor's stated reason. Required by the endpoint, so never blank. */
  reason: string;
  direction: AmendmentDirection;
  deltaPaise: number;
  /** Absolute value. The direction carries the sign. */
  deltaLabel: string;
  lines: readonly AmendmentLineView[];
  /** The stage this change is about, when it is about one. */
  stageId: string | null;
  expiresAt: string | null;
  /** The raw instant, for a server-clock countdown. Never formatted first. */
  expiresAtIso: string;
  respondedAt: string | null;
  appliedAt: string | null;
  createdAt: string | null;
}

function toAmendmentView(amendment: EngagementAmendment): AmendmentView {
  return {
    amendmentId: amendment.id,
    kind: amendment.kind,
    isKnownKind: isKnownAmendmentKind(amendment),
    status: amendment.status,
    isKnownStatus: isKnownAmendmentStatus(amendment),
    isDecidable: isAmendmentDecidable(amendment),
    isAwaitingPayment: isAmendmentAwaitingPayment(amendment),
    isApplied: isAmendmentApplied(amendment),
    reason: amendment.reason,
    direction: amendmentDirection(amendment),
    deltaPaise: amendment.delta_paise,
    deltaLabel: formatMoney(Math.abs(amendment.delta_paise)),
    lines: [...amendment.lines]
      .sort((left, right) => left.position - right.position)
      .map((line) => ({
        position: line.position,
        title: line.title.trim() === "" ? `Item ${line.position}` : line.title,
        quantity: line.quantity,
        amountLabel: formatMoney(Math.abs(line.amount_paise)),
        removesScope: line.amount_paise < 0,
        kind: line.kind,
      })),
    stageId: amendment.stage_id,
    expiresAt: formatInstant(amendment.expires_at),
    expiresAtIso: amendment.expires_at,
    respondedAt: formatInstant(amendment.responded_at),
    appliedAt: formatInstant(amendment.applied_at),
    createdAt: formatInstant(amendment.created_at),
  };
}

export interface AmendmentsView {
  /**
   * The one live change request, or null.
   *
   * One at a time is a server rule (`m2_amendment_not_actionable` when one is
   * already open), so this is a single value rather than a list — a screen that
   * rendered two would be rendering a state that cannot exist and would offer
   * two acceptances of which one must fail.
   */
  live: AmendmentView | null;
  /** Every change request, newest first, live one included. */
  all: readonly AmendmentView[];
  /** Only the ones the server stamped `applied_at` on — the agreement's versions. */
  applied: readonly AmendmentView[];
}

export function toAmendmentsView(list: EngagementAmendmentList): AmendmentsView {
  const all = [...list.amendments]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .map(toAmendmentView);

  return {
    live: all.find((amendment) => amendment.isDecidable || amendment.isAwaitingPayment) ?? null,
    all,
    applied: appliedAmendments(list).map(toAmendmentView),
  };
}

/**
 * What the agreement has been, version by version — `M2-FE-613`.
 *
 * Version 0 is what both parties originally agreed. Every applied amendment
 * after it is a version, in the order the server applied them, and the running
 * total is carried forward so a reader can follow the money without doing the
 * arithmetic themselves.
 *
 * **A proposed amendment is never a version.** It is a request, and putting it
 * in this list is exactly the failure `M2-FE-610` exists to prevent — which is
 * why the input is `appliedAmendments` and not the whole list.
 */
export interface AgreementVersionView {
  /** 0 for the original agreement, then 1, 2, … */
  version: number;
  title: string;
  /** The engagement total as at this version. */
  totalLabel: string;
  /** Null on version 0 — nothing changed to get there. */
  changeLabel: string | null;
  removesScope: boolean;
  reason: string | null;
  at: string | null;
  lines: readonly AmendmentLineView[];
}

export function toAgreementHistory(
  engagement: EngagementView,
  amendments: AmendmentsView,
  originalTotalPaise: number,
): readonly AgreementVersionView[] {
  const versions: AgreementVersionView[] = [
    {
      version: 0,
      title: "What you agreed",
      totalLabel: formatMoney(originalTotalPaise),
      changeLabel: null,
      removesScope: false,
      reason: null,
      at: engagement.createdAt,
      lines: [],
    },
  ];

  // Oldest applied first, so the running total moves forward the way it did.
  let runningPaise = originalTotalPaise;
  const oldestFirst = [...amendments.applied].reverse();

  oldestFirst.forEach((amendment, index) => {
    runningPaise += amendment.deltaPaise;
    versions.push({
      version: index + 1,
      title: amendment.kind === "TIME_EXTENSION" ? "Extra time agreed" : "Scope changed",
      totalLabel: formatMoney(runningPaise),
      changeLabel: amendment.deltaLabel,
      removesScope: amendment.deltaPaise < 0,
      reason: amendment.reason.trim() === "" ? null : amendment.reason,
      at: amendment.appliedAt,
      lines: amendment.lines,
    });
  });

  return versions;
}

/* --------------------------------------------------------------------------
   The event record — `M2-FE-512`
   -------------------------------------------------------------------------- */

export interface EngagementEventView {
  eventId: string;
  /** The stage this event is about, when it is about one. */
  stageId: string | null;
  /**
   * What the server called it. Never a sentence this client invented.
   *
   * `reason` is the server's own user-safe words where it has any; the code
   * de-slugged is the fallback, and it is a fallback rather than a lookup table
   * because `reason_code` carries **no published vocabulary** — a client-side
   * copy table over it would silently render "Update" for every code added after
   * this build. Logged in §7.
   */
  title: string;
  /** "From X to Y", de-slugged, when the transition names two states. */
  transition: string | null;
  /**
   * Whether a clock did this rather than a person.
   *
   * The one thing about the actor that is published, and it is the one that
   * matters: "approved" and "approved because the review window closed" are
   * different events. Actor identity is deliberately never on the wire.
   */
  actorIsSystem: boolean;
  at: string | null;
  atIso: string;
}

/** `AWAITING_REVIEW` → "Awaiting review". Never a lookup this client authored. */
function deSlug(value: string): string {
  const words = value.trim().replace(/[_-]+/g, " ").toLowerCase();
  return words === "" ? "" : words.charAt(0).toUpperCase() + words.slice(1);
}

export function toEngagementEvents(
  list: EngagementEventList,
): readonly EngagementEventView[] {
  return eventsOldestFirst(list).map((event) => {
    const fromLabel = deSlug(event.from_status);
    const toLabel = deSlug(event.to_status);

    return {
      eventId: event.id,
      stageId: event.stage,
      title:
        event.reason.trim() !== ""
          ? event.reason
          : deSlug(event.reason_code) || (toLabel === "" ? "Something changed" : toLabel),
      transition:
        fromLabel !== "" && toLabel !== "" ? `${fromLabel} to ${toLabel}` : null,
      actorIsSystem: event.actor_is_system,
      at: formatInstant(event.occurred_at),
      atIso: event.occurred_at,
    };
  });
}
