import type { Schemas } from "@vsolve/api-client";

import { humanise, type Tone } from "./cases";

/**
 * Reading money on an Operations screen, and the four ways it goes wrong.
 *
 * ## Nothing here computes a figure
 *
 * Every number this module handles arrives from the server as integer paise and leaves as a
 * formatted string. There is no addition, no netting off, no "amount minus refunds". A refund
 * figure a client derives is a figure that can disagree with a statement, and this is the console
 * where that disagreement becomes a dispute rather than a rounding question.
 *
 * ## `WAIVED` is not a charge
 *
 * `BookingFeeStatusEnum` gained `WAIVED` in 1.32.0, and a waived fee carries the published amount
 * while having collected nothing — it is the free re-dispatch after a vendor no-show. Rendering
 * `amount_paise` beside it as money the Customer paid is wrong in the one place it matters most,
 * so `bookingFeeReading` returns `collected: false` for it and the view refuses to print it as an
 * amount paid.
 *
 * ## An exception kind this build has never heard of still renders
 *
 * `ExceptionCount.kind` is a free-form string on the wire — six values exist today and the sweep
 * that produces them is free to add a seventh. The lookup falls back to the code itself rather
 * than to a blank row.
 */

/* ---------------------------------------------------------------------------
   Financial exceptions
   --------------------------------------------------------------------------- */

export type ReconciliationSummary = Schemas["ReconciliationSummary"];
export type ExceptionCount = Schemas["ExceptionCount"];

interface ExceptionCopy {
  label: string;
  meaning: string;
  tone: Tone;
}

const EXCEPTION_COPY: Record<string, ExceptionCopy> = {
  CAPTURE_WITHOUT_CAPACITY: {
    label: "Captured with no capacity",
    meaning: "Money was taken for work there was no capacity to do. Somebody is owed a decision.",
    tone: "danger",
  },
  PROVIDER_AMBIGUITY: {
    label: "Provider ambiguity",
    meaning: "The provider's answer did not establish what happened. Do not act on a guess.",
    tone: "warning",
  },
  REFUND_FAILED: {
    label: "Refund failed",
    meaning: "The provider refused a refund. The Customer has not been paid back.",
    tone: "danger",
  },
  AMOUNT_MISMATCH: {
    label: "Amount mismatch",
    meaning: "Two records of one amount do not agree.",
    tone: "danger",
  },
  CHARGEBACK: {
    label: "Chargeback",
    meaning: "A bank pulled a charge back. A case owns it and it is holding payout.",
    tone: "danger",
  },
  RECONCILIATION_MISMATCH: {
    label: "Reconciliation mismatch",
    meaning:
      "The scheduled sweep found two records of one fact that disagree. The sweep never corrects " +
      "what it finds, so this is waiting on a person.",
    tone: "warning",
  },
};

export function exceptionCopy(kind: string): ExceptionCopy {
  return (
    EXCEPTION_COPY[kind] ?? {
      label: humanise(kind),
      meaning:
        "An exception kind this console has no copy for. The count is the server's; the wording " +
        "is the raw code, deliberately, rather than a guess at what it means.",
      tone: "warning",
    }
  );
}

/**
 * Whether the reconciliation read is carrying anything at all.
 *
 * Zero everywhere is a real and good answer, and it is rendered as "nothing outstanding" rather
 * than as an empty panel — an empty panel labelled "Refunds" reads as "we have no data", which is
 * a different claim entirely.
 */
export function reconciliationIsClear(summary: ReconciliationSummary): boolean {
  return (
    summary.refunds_awaiting_provider === 0 &&
    summary.failed_refunds === 0 &&
    summary.open_by_kind.every((row) => row.count === 0)
  );
}

/* ---------------------------------------------------------------------------
   The money on one request, as the request timeline publishes it
   --------------------------------------------------------------------------- */

export type TimelineEventPayload = Schemas["TimelineEvent"];
export type RequestTimeline = Schemas["RequestTimeline"];

/**
 * The timeline event types that are money.
 *
 * An **inclusive** list. The tempting shape — "everything that is not a question or a transition
 * is money" — is the Gate 3 predicate that absorbs the next new event type silently, and it would
 * absorb it onto a money screen. Everything not named here is counted and reported as "other
 * events", never dropped and never re-labelled as money.
 */
export const MONEY_EVENT_TYPES = [
  "BOOKING_FEE",
  "QUOTE_UNLOCK",
  "VISIT_PLAN",
  "VISIT_PLAN_SHARE",
] as const;

export type MoneyEventType = (typeof MONEY_EVENT_TYPES)[number];

export function isMoneyEvent(event: TimelineEventPayload): boolean {
  return (MONEY_EVENT_TYPES as readonly string[]).includes(event.type);
}

export const MONEY_EVENT_LABEL: Record<MoneyEventType, string> = {
  BOOKING_FEE: "Booking fee (A3)",
  QUOTE_UNLOCK: "Quote unlock (A3 fallback)",
  VISIT_PLAN: "Visit plan (A5)",
  VISIT_PLAN_SHARE: "Visit share (A5)",
};

export function moneyEventLabel(type: string): string {
  return Object.hasOwn(MONEY_EVENT_LABEL, type)
    ? MONEY_EVENT_LABEL[type as MoneyEventType]
    : humanise(type);
}

/** A `detail` object read defensively — it is `{[key: string]: unknown}` on the wire. */
export function detailString(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];
  return typeof value === "string" && value !== "" ? value : null;
}

export function detailPaise(detail: Record<string, unknown>, key: string): number | null {
  const value = detail[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* ---------------------------------------------------------------------------
   Booking fee — the `WAIVED` trap
   --------------------------------------------------------------------------- */

export type BookingFeeStatus = Schemas["BookingFeeStatusEnum"];

export interface MoneyStatusReading {
  label: string;
  meaning: string;
  tone: Tone;
  /**
   * Whether the published amount is money that actually changed hands.
   *
   * `false` for every state where an amount exists on the record and nothing was collected.
   * The view prints the amount only when this is `true`, and says what the amount *is* otherwise.
   */
  collected: boolean;
}

export const BOOKING_FEE_READING: Record<BookingFeeStatus, MoneyStatusReading> = {
  OFFER_ACCEPTED: {
    label: "Offer accepted",
    meaning: "A vendor accepted at the published rate. The fee is chargeable and not yet charged.",
    tone: "info",
    collected: false,
  },
  PENDING: {
    label: "Awaiting the provider",
    meaning: "Charged but unconfirmed. Only the verified callback hardens the booking.",
    tone: "warning",
    collected: false,
  },
  ACTIVE: {
    label: "Paid",
    meaning: "The provider confirmed it. The engagement exists.",
    tone: "success",
    collected: true,
  },
  EARNED: {
    label: "Earned",
    meaning: "The crew was dispatched and the fee is ours.",
    tone: "success",
    collected: true,
  },
  FORFEIT_SPLIT: {
    label: "Forfeited and split",
    meaning:
      "The Customer did not show or cancelled late. The fee was split — travel compensation to " +
      "the lead, the rest to the platform. Both shares are published beside it.",
    tone: "warning",
    collected: true,
  },
  REFUNDED: {
    label: "Refunded",
    meaning: "Returned in full. On a vendor no-show this pairs with a free re-dispatch.",
    tone: "neutral",
    collected: true,
  },
  FAILED: {
    label: "Failed",
    meaning: "The charge did not go through. Nothing was collected and no engagement was created.",
    tone: "danger",
    collected: false,
  },
  // 1.32.0's third trap, in one line.
  WAIVED: {
    label: "Replacement crew — no charge",
    meaning:
      "The free re-dispatch after a vendor no-show. The row carries the published fee so the " +
      "record is complete, and **nothing was collected**. This is not money the Customer paid.",
    tone: "info",
    collected: false,
  },
};

export function bookingFeeReading(status: string): MoneyStatusReading {
  return (
    BOOKING_FEE_READING[status as BookingFeeStatus] ?? {
      label: humanise(status),
      meaning:
        "A booking-fee state this console has no copy for. Whether anything was collected is not " +
        "assumed, so the amount is not printed as paid.",
      tone: "warning",
      collected: false,
    }
  );
}

/* ---------------------------------------------------------------------------
   Chargeback
   --------------------------------------------------------------------------- */

export interface ChargebackDraft {
  paymentAttemptId: string;
  amountRupees: string;
  providerReference: string;
  reasonCode: string;
}

export const EMPTY_CHARGEBACK: ChargebackDraft = {
  paymentAttemptId: "",
  amountRupees: "",
  providerReference: "",
  reasonCode: "",
};

export type ChargebackProblemField = keyof ChargebackDraft;

export interface ChargebackProblem {
  field: ChargebackProblemField;
  message: string;
}

/**
 * Shape checks only, and one of them is a rule rather than a shape.
 *
 * `provider_reference` is required by the endpoint because a chargeback with no bank reference
 * cannot be reconciled — recording one would be recording a rumour. Catching that here saves a
 * round trip; the server refuses it either way.
 *
 * The amount is typed in rupees and converted once, here, because an operator reading a bank
 * statement has rupees in front of them. It is the only arithmetic in this feature and it is a
 * unit conversion on an operator's own input, not a derived figure.
 */
export function validateChargeback(
  draft: ChargebackDraft,
  isUuid: (value: string) => boolean,
): ChargebackProblem[] {
  const problems: ChargebackProblem[] = [];
  if (!isUuid(draft.paymentAttemptId)) {
    problems.push({
      field: "paymentAttemptId",
      message: "A payment attempt id, as it appears on the payment record.",
    });
  }
  const paise = chargebackAmountPaise(draft.amountRupees);
  if (paise === null || paise <= 0) {
    problems.push({
      field: "amountRupees",
      message: "The amount the bank pulled back, in rupees, exactly as the notice states it.",
    });
  }
  if (draft.providerReference.trim() === "") {
    problems.push({
      field: "providerReference",
      message: "The bank's reference. Without it this cannot be reconciled and will not be recorded.",
    });
  }
  if (draft.reasonCode.trim() === "") {
    problems.push({ field: "reasonCode", message: "The reason code the bank gave." });
  }
  return problems;
}

export function chargebackAmountPaise(rupees: string): number | null {
  const trimmed = rupees.trim();
  if (trimmed === "" || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function problemFor(
  problems: ChargebackProblem[],
  field: ChargebackProblemField,
): string | undefined {
  return problems.find((problem) => problem.field === field)?.message;
}
