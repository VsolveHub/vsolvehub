import type { Schemas } from "@vsolve/api-client";

import { isUuid } from "@/features/shared/identifiers";

/**
 * What Finance can say about a refund, and what it must not.
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
 * Finance exists to catch.
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
    errors.reasonCode = `Give the reason code Finance uses, up to ${REASON_CODE_MAX_LENGTH} characters.`;
  } else if (!REASON_CODE_PATTERN.test(reason)) {
    errors.reasonCode = "Letters, numbers, hyphens and underscores only — no spaces.";
  }

  return errors;
}
