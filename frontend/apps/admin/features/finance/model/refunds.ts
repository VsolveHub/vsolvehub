import type { Schemas } from "@vsolve/api-client";

import { isUuid } from "@/features/shared/identifiers";

/**
 * What the console can say about a refund, and what it must not.
 *
 * ## `202` is not "refunded"
 *
 * `POST /finance/refunds/` answers **202 Accepted** and the refund comes back as
 * `REQUESTED`. Nothing has left the business yet: `submit_refund` sends it to
 * the provider afterwards, and the provider decides. A console that said
 * "refunded" at that moment would have an operator tell a Customer their money
 * is on the way before anyone asked the bank.
 *
 * So every status here is given its own sentence, and the two that mean "we do
 * not know yet" say so.
 *
 * ## Reconciliation state is a second, independent fact
 *
 * `status` is where the refund got to; `reconciliation_state` is whether our
 * record and the provider's agree. `NEEDS_ATTENTION` on a `SUCCEEDED` refund is
 * a real and confusing combination — the money moved and the books do not
 * balance — and collapsing the two into one badge would hide exactly the case
 * this console exists to catch.
 */

export type RefundStatus = Schemas["RefundStatusEnum"];
export type ReconciliationState = Schemas["ReconciliationStateEnum"];

export const STATUS_LABEL: Record<RefundStatus, string> = {
  REQUESTED: "Requested",
  SUBMITTED: "Sent to the provider",
  PROCESSING: "With the provider",
  SUCCEEDED: "Paid back",
  FAILED: "Failed",
  UNDER_REVIEW: "Needs a person",
};

export const STATUS_MEANING: Record<RefundStatus, string> = {
  REQUESTED:
    "Recorded on our side. Nothing has been sent to the provider yet, so no money has moved.",
  SUBMITTED: "Sent to the provider. They have not confirmed it yet.",
  PROCESSING: "The provider is working on it. The outcome is not known yet.",
  SUCCEEDED: "The provider confirmed the money went back.",
  FAILED: "The provider refused it. Nothing was returned to the Customer.",
  UNDER_REVIEW:
    "We could not establish what the provider did. Do not issue another refund for this — reconcile it, and escalate if it stays here.",
};

export const STATUS_TONE: Record<RefundStatus, "info" | "success" | "warning" | "danger"> = {
  REQUESTED: "info",
  SUBMITTED: "info",
  PROCESSING: "info",
  SUCCEEDED: "success",
  FAILED: "danger",
  UNDER_REVIEW: "warning",
};

export const RECONCILIATION_LABEL: Record<ReconciliationState, string> = {
  PENDING: "Not reconciled yet",
  IN_SYNC: "Matches the provider",
  NEEDS_ATTENTION: "Does not match the provider",
};

export const RECONCILIATION_TONE: Record<
  ReconciliationState,
  "neutral" | "success" | "warning"
> = {
  PENDING: "neutral",
  IN_SYNC: "success",
  NEEDS_ATTENTION: "warning",
};

/**
 * True while the outcome is genuinely unknown.
 *
 * The one question this surface must be able to answer before somebody issues a
 * second refund by hand.
 */
export function isOutcomeUnknown(refund: Schemas["Refund"]): boolean {
  return (
    refund.status === "REQUESTED" ||
    refund.status === "SUBMITTED" ||
    refund.status === "PROCESSING" ||
    refund.status === "UNDER_REVIEW"
  );
}

/** Django's `RefundCreateRequest`: `maxItems: 20` on the unit list. */
export const MAX_UNITS = 20;
/** `reason_code`: `^[-a-zA-Z0-9_]+$`, 1–80 characters. */
export const REASON_CODE_MAX_LENGTH = 80;

const REASON_CODE_PATTERN = /^[-a-zA-Z0-9_]+$/;

export interface RefundDraft {
  orderId: string;
  /** One id per line, as typed. */
  unitIds: string;
  reasonCode: string;
}

/** The ids the operator actually entered, in order, without blanks. */
export function parseUnitIds(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Everything the client can check without guessing.
 *
 * Deliberately excluded: whether the Order exists, whether the units belong to
 * it, whether the payment was captured, and whether anything is left to refund.
 * All four are server facts with named refusals, and answering them here would
 * block legitimate refunds.
 */
export function validateRefund(draft: RefundDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const units = parseUnitIds(draft.unitIds);

  if (!isUuid(draft.orderId)) {
    errors.orderId = "Paste the Order id from the case you are working.";
  }
  if (units.length === 0) {
    errors.unitIds = "Name at least one visit to refund.";
  } else if (units.length > MAX_UNITS) {
    errors.unitIds = `Django refuses more than ${MAX_UNITS} visits in one refund. Split it.`;
  } else if (units.some((id) => !isUuid(id))) {
    errors.unitIds = "One of these is not a fulfilment unit id. One id per line.";
  } else if (new Set(units).size !== units.length) {
    errors.unitIds = "The same visit is listed twice.";
  }

  const reason = draft.reasonCode.trim();
  if (reason === "" || reason.length > REASON_CODE_MAX_LENGTH) {
    errors.reasonCode = `Give the reason code Operations uses, up to ${REASON_CODE_MAX_LENGTH} characters.`;
  } else if (!REASON_CODE_PATTERN.test(reason)) {
    errors.reasonCode = "Letters, numbers, hyphens and underscores only — no spaces.";
  }

  return errors;
}

/* -------------------------------------------------------------------------
   Reading a refund at a glance (contract 1.115.0)
   ------------------------------------------------------------------------- */

export type RefundStartedBy = Schemas["StartedByEnum"];
export type RefundPaidFor = Schemas["PaidForEnum"];

export const STARTED_BY_LABEL: Record<RefundStartedBy, string> = {
  AUTOMATIC: "Automatic",
  CUSTOMER: "Customer",
  OPERATIONS: "Operations",
};

export const STARTED_BY_MEANING: Record<RefundStartedBy, string> = {
  AUTOMATIC: "The system asked for it, for example after a cancellation.",
  CUSTOMER: "The customer's own action, such as cancelling a visit.",
  OPERATIONS: "Someone on the team issued it from this console.",
};

export const STARTED_BY_TONE: Record<RefundStartedBy, "info" | "neutral" | "warning"> = {
  AUTOMATIC: "info",
  CUSTOMER: "neutral",
  OPERATIONS: "warning",
};

/** What the refunded payment bought, in the words Operations uses. Unknown purposes fall back. */
export function paidForLabel(purpose: RefundPaidFor | null | undefined): string {
  if (!purpose) return "—";
  if (purpose === "BOOKING_GROUP" || purpose === "SCOPE_AMENDMENT_REVISION") return "Home visit";
  if (purpose.startsWith("A7_")) return "Rental";
  if (purpose.startsWith("A9_")) return "Stay";
  if (purpose.startsWith("A10_")) return "Vendor plan";
  if (purpose === "WALLET_TOP_UP") return "Wallet top-up";
  if (purpose.startsWith("M2_")) return "Project or crew job";
  return humanize(purpose);
}

const REASON_LABEL: Record<string, string> = {
  customer_cancelled: "Customer cancelled the visit",
  customer_cancelled_rental: "Customer cancelled the rental",
  customer_cancelled_stay_reservation: "Customer cancelled the stay",
  rental_paid_after_cancellation: "Paid after the booking was already cancelled",
  capture_without_capacity: "Paid, but the booking could not be held",
  capture_after_terminal: "Paid after the booking had ended",
  "service-not-delivered": "Service not delivered",
  m2_requirement_cancelled: "Customer cancelled the job",
  m2_requirement_reclassified: "Job was re-classified",
  m2_estimate_window_missed: "No estimate in time",
  m2_visit_slot_never_filled: "No one took the visit slot",
  m2_scope_reduced_by_amendment: "Scope was reduced",
  m2_project_transferred: "Project moved to another vendor",
  m2_project_terminated: "Project was ended",
};

function humanize(code: string): string {
  const words = code.replace(/[-_]+/g, " ").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "—";
}

/** A reason code as a sentence. Known codes are written out; any other is made readable. */
export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? humanize(code);
}
