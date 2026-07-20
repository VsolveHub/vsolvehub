// ─────────────────────────────────────────────────────────────────────────────
// The Order ledger. An Order is the money envelope for a cart: ONE gateway
// authorization covering N bookings, each captured or voided independently as
// its provider accepts or its pool runs dry.
//
// Bookings stay the unit of work. This is the only place money is accounted, so
// "how much of this order is authorized vs. captured vs. voided" has exactly one
// answer.
// ─────────────────────────────────────────────────────────────────────────────

import type { PaymentState } from "@prisma/client";
import { prisma } from "./client";

export type MoneyLedger = {
  authorizedPaise: number;
  capturedPaise: number;
  voidedPaise: number;
  refundedPaise: number;
};

export type OrderStatusValue =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "AUTHORIZED"
  | "PARTIALLY_SETTLED"
  | "SETTLED"
  | "CANCELLED";

/** Job states from which a booking can never move again. */
export const TERMINAL_JOB_STATUSES = ["COMPLETED", "CANCELLED", "NO_WORKER_FOUND"] as const;

function isTerminal(status: string): boolean {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
}

/**
 * Throws when a ledger is impossible. Call before every write that moves money —
 * a corrupted ledger is far more expensive to discover during reconciliation
 * than to reject at the point of writing.
 */
export function assertMoneyInvariant(ledger: MoneyLedger): void {
  for (const [name, value] of Object.entries(ledger)) {
    if (value < 0) throw new Error(`Order ledger has a negative ${name}`);
  }
  if (ledger.capturedPaise + ledger.voidedPaise > ledger.authorizedPaise) {
    throw new Error("Order ledger: captured + voided exceeds authorized");
  }
  if (ledger.refundedPaise > ledger.capturedPaise) {
    throw new Error("Order ledger: refunded exceeds captured");
  }
}

/**
 * Derive the order's status from the states of its bookings. An order is only
 * CANCELLED when nothing in it was ever fulfilled; a cancellation next to a
 * completion is a settled order that happened to include a cancelled job.
 */
export function rollUpOrderStatus(jobStatuses: string[]): OrderStatusValue {
  if (jobStatuses.length === 0) return "DRAFT";
  if (jobStatuses.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (jobStatuses.every(isTerminal)) return "SETTLED";
  if (jobStatuses.some(isTerminal)) return "PARTIALLY_SETTLED";
  return "AUTHORIZED";
}

/** Payment state implied by a ledger, once authorization has happened. */
export function derivePaymentState(ledger: MoneyLedger): PaymentState {
  if (ledger.refundedPaise > 0 && ledger.refundedPaise >= ledger.capturedPaise) return "REFUNDED";
  if (ledger.authorizedPaise === 0) return "COD_PENDING";
  if (ledger.voidedPaise >= ledger.authorizedPaise) return "VOIDED";
  if (ledger.capturedPaise === 0) return "AUTHORIZED";
  if (ledger.capturedPaise + ledger.voidedPaise >= ledger.authorizedPaise) return "CAPTURED";
  return "PARTIALLY_CAPTURED";
}

/**
 * This booking's captured share, defaulting to its quoted amount when the
 * per-booking capture field was never populated (legacy rows, or an immediate
 * method captured at authorize before per-booking capture was tracked).
 */
export function bookingCapturedShare(capturedPaise: number, quotedAmount: number): number {
  return capturedPaise > 0 ? capturedPaise : quotedAmount;
}

export type CancelSettlement = { refundPaise: number; voidPaise: number };

/**
 * Money to return when a booking is cancelled, given the order ledger, the
 * booking's own share, and the retained cancellation fee. A captured (prepaid)
 * booking refunds its share minus the fee; an uncaptured card hold voids its
 * share minus the fee. COD and never-authorized bookings move no money. Pure and
 * clamped so it can never produce a negative or over-ledger amount — the caller
 * still re-asserts the invariant before writing.
 */
export function computeCancelSettlement(input: {
  paymentStatus: string;
  quotedAmount: number;
  capturedPaise: number;
  feePaise: number;
  order: MoneyLedger;
}): CancelSettlement {
  const fee = Math.max(0, input.feePaise);
  if (input.paymentStatus === "PAID") {
    const share = bookingCapturedShare(input.capturedPaise, input.quotedAmount);
    const refundable = Math.max(0, input.order.capturedPaise - input.order.refundedPaise);
    return { refundPaise: Math.max(0, Math.min(share, refundable) - fee), voidPaise: 0 };
  }
  if (input.paymentStatus === "PENDING") {
    const releasable = Math.max(
      0,
      input.order.authorizedPaise - input.order.capturedPaise - input.order.voidedPaise,
    );
    return { refundPaise: 0, voidPaise: Math.max(0, Math.min(input.quotedAmount, releasable) - fee) };
  }
  return { refundPaise: 0, voidPaise: 0 };
}

/**
 * How much of a booking's share still needs capturing against its order: the
 * uncaptured, unvoided headroom capped at the booking's quoted amount. Zero once
 * the share is already captured (immediate methods, or a card hold captured at
 * assignment), which is what keeps a second capture from double-charging.
 */
export function bookingCaptureShortfall(input: {
  paymentStatus: string;
  quotedAmount: number;
  order: MoneyLedger;
}): number {
  if (input.paymentStatus !== "PENDING") return 0;
  const releasable = Math.max(
    0,
    input.order.authorizedPaise - input.order.capturedPaise - input.order.voidedPaise,
  );
  return Math.min(input.quotedAmount, releasable);
}

/**
 * Re-derive an order's status and payment state from its bookings and ledger.
 * Call after any transition that finalises a job — accept, cancel, exhaustion.
 */
export async function recomputeOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { bookings: { select: { status: true } } },
  });
  if (!order) return;

  const ledger: MoneyLedger = {
    authorizedPaise: order.authorizedPaise,
    capturedPaise: order.capturedPaise,
    voidedPaise: order.voidedPaise,
    refundedPaise: order.refundedPaise,
  };
  assertMoneyInvariant(ledger);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: rollUpOrderStatus(order.bookings.map((b) => b.status)),
      paymentState: derivePaymentState(ledger),
    },
  });
}
