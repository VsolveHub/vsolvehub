import type { Schemas } from "@vsolve/api-client";

/**
 * What a case *is*, in the vocabulary contract 1.32.0 publishes.
 *
 * ## Every map here is keyed on the generated enum, on purpose
 *
 * `Record<CaseKind, …>` is not decoration. Wave C6 widened `OperationsCaseKindEnum` from nine
 * values to fourteen and `OperationsCaseEventKindEnum` from eight to fourteen, and the failure
 * mode that widening produces is silent: a `switch` that was exhaustive yesterday falls through
 * today, and an event trail renders six kinds of blank row. Keying on the generated enum turns
 * the next widening into a `tsc` failure in this file rather than an empty `<li>` in production.
 *
 * ## Membership is decided by naming the members, never by excluding non-members
 *
 * Gate 3 cost a wave to a predicate that decided membership by exclusion — `everything that is
 * not X is Y` — which absorbed a new enum value without anybody noticing. So: closed statuses are
 * listed, payout-holding is read from the server's own `holds_payout` rather than re-derived from
 * the kind, and the subject is found by looking at all five subject fields rather than by
 * assuming the three that existed at 1.31.0.
 *
 * ## The resolution vocabulary is not here
 *
 * `allowed_resolutions` is published per case because the rule differs per kind and lives in
 * Django. This module humanises a resolution string for display and does not decide which ones a
 * case may reach — the same rule the M1 console has followed since 1.17.0.
 */

export type OperationsCase = Schemas["OperationsCase"];
export type OperationsCaseRow = Schemas["OperationsCaseList"];
export type CaseKind = Schemas["OperationsCaseKindEnum"];
export type CaseStatus = Schemas["OperationsCaseStatusEnum"];
export type CaseSeverity = Schemas["OperationsCaseSeverityEnum"];
export type CaseTeam = Schemas["OperationsCaseTeamEnum"];
export type CaseEventKind = Schemas["OperationsCaseEventKindEnum"];
export type CaseEvidence = Schemas["OperationsCaseEvidence"];
export type CaseEvent = Schemas["OperationsCaseEvent"];

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/* ---------------------------------------------------------------------------
   Kinds
   --------------------------------------------------------------------------- */

export interface CaseKindCopy {
  /** The queue label. Plain language, not the enum. */
  label: string;
  /** What somebody has actually claimed. Shown on the detail, so a reviewer knows the question. */
  claim: string;
  /** True for the five kinds Wave C6 added. Marked so a reviewer can see what is new to M2. */
  isM2: boolean;
}

export const CASE_KIND_COPY: Record<CaseKind, CaseKindCopy> = {
  ASSIGNMENT: {
    label: "Assignment or recovery",
    claim: "A booking could not be assigned, or the assignment it had stopped working.",
    isM2: false,
  },
  LATE_NO_SHOW: {
    label: "Late or no-show",
    claim: "Somebody says the crew did not arrive, or did not arrive on time.",
    isM2: false,
  },
  CUSTOMER_UNAVAILABLE: {
    label: "Customer unavailable",
    claim: "The vendor says nobody was at the site, or the site could not be entered.",
    isM2: false,
  },
  PARTIAL_WORK: {
    label: "Partial or aborted work",
    claim: "The work stopped part-way and the two accounts of how much was done differ.",
    isM2: false,
  },
  QUALITY: {
    label: "Quality or warranty",
    claim: "The Customer says the work was not done to the standard promised.",
    isM2: false,
  },
  SAFETY: {
    label: "Safety or damage",
    claim: "Somebody was hurt, put at risk, or something was damaged.",
    isM2: false,
  },
  PAYMENT: {
    label: "Payment ambiguity",
    claim: "A payment record and the provider's record do not agree.",
    isM2: false,
  },
  REFUND: {
    label: "Refund ambiguity",
    claim: "A refund's state cannot be established from our record alone.",
    isM2: false,
  },
  PAYOUT: {
    label: "Payout ambiguity",
    claim: "A payout may have been made twice, or reserved and never released.",
    isM2: false,
  },
  CANCELLATION_CONFLICT: {
    label: "Conflicting cancellation",
    claim:
      "One side cancelled and the other disputed it. Nothing has been refunded or paid out, " +
      "and the vendor's unpaid earnings are frozen until this is decided.",
    isM2: true,
  },
  ATTENDANCE: {
    label: "Disputed attendance",
    claim: "The Customer and the supervisor recorded different head counts for a shift day.",
    isM2: true,
  },
  STAGE: {
    label: "Disputed stage or milestone",
    claim: "A milestone was submitted as finished and the Customer says it is not.",
    isM2: true,
  },
  OFF_PLATFORM: {
    label: "Off-platform payment claim",
    claim:
      "Somebody reports that money moved outside the platform. A report is an account, not a " +
      "finding — this case decides whether the evidence bears it out.",
    isM2: true,
  },
  CHARGEBACK: {
    label: "Chargeback",
    claim:
      "The Customer's bank pulled a charge back. The claim is in progress: the fee row has not " +
      "moved, because marking it refunded would announce a decision nobody has taken.",
    isM2: true,
  },
};

/** Every kind, in queue order — the M2 kinds last so the M1 queue reads unchanged. */
export const CASE_KINDS: CaseKind[] = Object.keys(CASE_KIND_COPY) as CaseKind[];

export function caseKindLabel(kind: string): string {
  return isKnownCaseKind(kind) ? CASE_KIND_COPY[kind].label : humanise(kind);
}

export function isKnownCaseKind(kind: string): kind is CaseKind {
  return Object.hasOwn(CASE_KIND_COPY, kind);
}

/* ---------------------------------------------------------------------------
   Subject — the trap 1.32.0 names first
   --------------------------------------------------------------------------- */

export type CaseSubjectKey =
  | "booking_id"
  | "order_id"
  | "partner_id"
  | "requirement_id"
  | "engagement_id";

export interface CaseSubject {
  key: CaseSubjectKey;
  id: string;
  /** What this case is about, named for a reader. */
  label: string;
}

/**
 * All five subject fields, enumerated.
 *
 * `open_case` refuses unless exactly one is set, so exactly one comes back — but all five are
 * nullable on the wire and a reader that checked `booking_id`, then `order_id`, then `partner_id`
 * and gave up would show a case about a requirement or an engagement as a case about nothing.
 * Both of those are M2's own subjects, so that reader would be blank on precisely the cases this
 * console was built for.
 *
 * Returns every set subject rather than the first, so the impossible-but-published state (two set)
 * is visible rather than half-hidden.
 */
export function caseSubjects(item: {
  booking_id: string | null;
  order_id: string | null;
  partner_id: string | null;
  requirement_id?: string | null;
  engagement_id?: string | null;
}): CaseSubject[] {
  const candidates: { key: CaseSubjectKey; id: string | null | undefined; label: string }[] = [
    { key: "requirement_id", id: item.requirement_id, label: "Request" },
    { key: "engagement_id", id: item.engagement_id, label: "Engagement" },
    { key: "booking_id", id: item.booking_id, label: "Booking" },
    { key: "order_id", id: item.order_id, label: "Order" },
    { key: "partner_id", id: item.partner_id, label: "Partner" },
  ];
  return candidates
    .filter((candidate): candidate is CaseSubject => Boolean(candidate.id))
    .map((candidate) => ({ key: candidate.key, id: candidate.id, label: candidate.label }));
}

/** The request this case is about, when it has one. The only id that opens a request console. */
export function caseRequirementId(item: { requirement_id?: string | null }): string | null {
  return item.requirement_id ?? null;
}

/* ---------------------------------------------------------------------------
   Status, severity, team
   --------------------------------------------------------------------------- */

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting on someone",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

/** Named, not inferred. `everything that is not RESOLVED is open` is the Gate 3 mistake. */
const CLOSED_STATUSES: CaseStatus[] = ["RESOLVED", "CANCELLED"];

export function isCaseClosed(item: { status: CaseStatus }): boolean {
  return CLOSED_STATUSES.includes(item.status);
}

export const SEVERITY_TONE: Record<CaseSeverity, Tone> = {
  LOW: "neutral",
  NORMAL: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export const TEAM_LABEL: Record<CaseTeam, string> = {
  DISPATCH: "Dispatch",
  BOOKING_SUPPORT: "Booking support",
  QUALITY_SUPPORT: "Quality",
  SAFETY: "Safety",
  FINANCE: "Finance",
};

export function teamLabel(team: string): string {
  return isKnownTeam(team) ? TEAM_LABEL[team] : humanise(team);
}

function isKnownTeam(team: string): team is CaseTeam {
  return Object.hasOwn(TEAM_LABEL, team);
}

/* ---------------------------------------------------------------------------
   Events — fourteen kinds, none of them a blank row
   --------------------------------------------------------------------------- */

export interface EventCopy {
  title: string;
  tone: Tone;
}

export const EVENT_COPY: Record<CaseEventKind, EventCopy> = {
  OPENED: { title: "Opened", tone: "info" },
  CLAIMED: { title: "Claimed by an operator", tone: "neutral" },
  STATUS_CHANGED: { title: "Status changed", tone: "neutral" },
  SEVERITY_CHANGED: { title: "Severity changed", tone: "warning" },
  NOTE: { title: "Note", tone: "neutral" },
  COMMUNICATION: { title: "Sent to a person", tone: "neutral" },
  RESOLVED: { title: "Resolved", tone: "success" },
  CANCELLED: { title: "Cancelled", tone: "neutral" },
  // Wave C6's six. Each carries its context object rather than a body, which is exactly why a
  // trail keyed on `body` alone showed six kinds of empty line.
  EVIDENCE: { title: "Evidence submitted", tone: "info" },
  DEADLINE_SET: { title: "Response deadline set", tone: "warning" },
  APPEAL_REQUESTED: { title: "Appeal requested", tone: "warning" },
  APPEAL_DECIDED: { title: "Appeal decided", tone: "info" },
  OVERRIDE: { title: "Outcome overridden by hand", tone: "danger" },
  PAYOUT_HOLD_CHANGED: { title: "Payout hold changed", tone: "warning" },
};

export function eventCopy(kind: string): EventCopy {
  if (Object.hasOwn(EVENT_COPY, kind)) return EVENT_COPY[kind as CaseEventKind];
  // An unpublished kind is still a fact that happened. Naming it is better than dropping it, and
  // far better than an empty row — this is the branch that survives the next widening.
  return { title: humanise(kind), tone: "neutral" };
}

/**
 * The context object an event carries, as readable pairs.
 *
 * `context` is `unknown` on the wire — deliberately, it differs per kind. Rendering it as
 * key/value pairs shows the operator what the server recorded without this file pretending to
 * know the shape of a payload it has never been told about.
 */
export function eventContextPairs(context: unknown): { key: string; value: string }[] {
  if (typeof context !== "object" || context === null || Array.isArray(context)) return [];
  return Object.entries(context as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key: humanise(key),
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));
}

/* ---------------------------------------------------------------------------
   Evidence — a reference, never a file
   --------------------------------------------------------------------------- */

export const EVIDENCE_PARTY_LABEL: Record<Schemas["OperationsCaseEvidencePartyEnum"], string> = {
  CUSTOMER: "Customer",
  PARTNER: "Partner",
  OPERATIONS: "Operations",
};

export function evidencePartyLabel(party: string): string {
  return Object.hasOwn(EVIDENCE_PARTY_LABEL, party)
    ? EVIDENCE_PARTY_LABEL[party as Schemas["OperationsCaseEvidencePartyEnum"]]
    : humanise(party);
}

/** Which upload rail this piece of evidence came through. Both are scanned; neither is here. */
export function evidenceRail(item: CaseEvidence): "requirement attachment" | "stage evidence" | null {
  if (item.requirement_attachment_id) return "requirement attachment";
  if (item.stage_evidence_id) return "stage evidence";
  return null;
}

/* ---------------------------------------------------------------------------
   Appeal
   --------------------------------------------------------------------------- */

export type AppealPhase = "NONE" | "AWAITING_DECISION" | "DECIDED";

export function appealPhase(item: OperationsCase): AppealPhase {
  if (item.appeal_requested_at === null) return "NONE";
  return item.appeal_decided_at === null ? "AWAITING_DECISION" : "DECIDED";
}

/* ---------------------------------------------------------------------------
   Payout hold
   --------------------------------------------------------------------------- */

/**
 * How many ledger entries this case is freezing.
 *
 * `held_ledger_entry_ids` is `unknown` on the wire. Reading a length off it without checking
 * would be a client asserting a shape the contract does not promise, on a screen about frozen
 * money. `null` means "the server did not publish a countable list", which is rendered as such.
 */
export function heldEntryCount(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

/* ---------------------------------------------------------------------------
   Resolutions
   --------------------------------------------------------------------------- */

/**
 * Display copy for a resolution the server offered.
 *
 * Keyed by the resolution string with a humanising fallback, and deliberately **not** a map from
 * kind to resolutions: the server publishes `allowed_resolutions` per case precisely so this
 * console does not carry a second copy of a rule that differs per kind. A resolution missing from
 * this map still renders — as its own words, never as nothing.
 */
const RESOLUTION_MEANING: Record<string, string> = {
  CANCELLATION_UPHELD: "The cancellation stands, on the terms it was evaluated at.",
  CANCELLATION_REVERSED: "The cancellation does not stand. The request goes on.",
  ATTENDANCE_CONFIRMED: "The recorded head count was right.",
  SHORTFALL_SETTLED: "A shortfall was agreed and settled between the parties.",
  STAGE_APPROVED: "The milestone counts as finished.",
  STAGE_CORRECTED: "The milestone goes back for correction.",
  STAGE_REFUNDED: "The milestone's funding goes back to the Customer.",
  SUBSTANTIATED: "The evidence bore the account out. What follows is a separate decision.",
  UNSUBSTANTIATED: "The evidence did not bear the account out.",
  RECOVERED: "The bank returned the money to us.",
  REPRESENTED: "We defended the charge successfully.",
  WRITTEN_OFF: "We are not pursuing it further.",
  SETTLED: "The parties settled it and the finding records that.",
  DENIED_WITH_REASON: "Declined, with the reason recorded.",
  PROTECTIVE_ACTION_TAKEN: "A protective action was taken and recorded.",
  DOCUMENTED_NO_ACTION: "Documented; no action was warranted.",
  CALLBACK_BOOKED: "A callback visit was booked.",
  LINES_SETTLED: "The disputed lines were settled one by one.",
  REFUNDED: "A refund was decided. It executes through the product that owns it.",
  REPLACED: "A replacement was assigned.",
  RESCHEDULED: "It was moved to another time.",
  PERFORMED: "The work was performed.",
  CANCELLED: "It was cancelled.",
  VISIT_FEE_DECIDED: "The visit fee was decided either way.",
  PAID_ONCE: "Confirmed paid exactly once.",
  RESERVATION_RELEASED: "The reservation was released.",
  RECONCILED: "The two records were made to agree.",
};

export function resolutionLabel(resolution: string): string {
  return humanise(resolution);
}

export function resolutionMeaning(resolution: string): string | null {
  return RESOLUTION_MEANING[resolution] ?? null;
}

/* ---------------------------------------------------------------------------
   Shared
   --------------------------------------------------------------------------- */

/** `CANCELLATION_CONFLICT` → `Cancellation conflict`. Never a blank. */
export function humanise(value: string): string {
  const words = value.replaceAll("_", " ").trim().toLowerCase();
  if (words === "") return "—";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A server timestamp, formatted for an Indian operations desk.
 *
 * Formatting only. Nothing here compares a server time to a device clock — `is_overdue` and
 * `server_now` are published for exactly that reason, and a console that decided overdueness
 * itself would call a breached case on-time on a laptop running slow.
 */
export function formatMoment(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "in 3 hours" / "5 hours ago", measured against the server's own clock.
 *
 * `serverNow` is required rather than optional: making it optional is how a caller ends up
 * passing nothing and this function quietly reads `Date.now()`.
 */
export function describeRelative(value: string, serverNow: string): string {
  const deltaMs = new Date(value).getTime() - new Date(serverNow).getTime();
  const minutes = Math.round(Math.abs(deltaMs) / 60_000);
  const past = deltaMs < 0;
  const amount =
    minutes < 60
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : minutes < 60 * 48
        ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"}`
        : `${Math.round(minutes / 1440)} days`;
  return past ? `${amount} ago` : `in ${amount}`;
}
