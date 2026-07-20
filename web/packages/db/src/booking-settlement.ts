// ─────────────────────────────────────────────────────────────────────────────
// Booking-level money settlement — the DB + gateway wiring around the pure
// ledger math in orders.ts. Three operations the direct-booking flow needs after
// checkout:
//
//   captureAssignedBookingPayment  — the "Pay now" action: capture a booking's
//                                    share against its order (card-hold path).
//   settleCancelledBooking         — refund/void a cancelled booking's share,
//                                    net of the retained cancellation fee.
//   captureRevisionDelta           — charge the customer-approved extra on a
//                                    revised (extra-parts) quote.
//
// Every order-ledger change flows through applyOrderDelta, which re-asserts
// assertMoneyInvariant before committing and re-derives the order's status, so
// the order can never drift from its bookings or hold an impossible ledger.
// ─────────────────────────────────────────────────────────────────────────────

import type { Booking, Order } from "@prisma/client";
import { prisma } from "./client";
import { authStrategy, getPaymentGateway, type PaymentMethod } from "./payments";
import {
  assertMoneyInvariant,
  bookingCaptureShortfall,
  computeCancelSettlement,
  recomputeOrderStatus,
  type MoneyLedger,
} from "./orders";
import type { EngineResult } from "./fulfillment";

function ledgerOf(order: Order): MoneyLedger {
  return {
    authorizedPaise: order.authorizedPaise,
    capturedPaise: order.capturedPaise,
    voidedPaise: order.voidedPaise,
    refundedPaise: order.refundedPaise,
  };
}

type LedgerDelta = Partial<MoneyLedger>;

/**
 * Apply signed increments to an order's ledger under the money invariant, then
 * re-derive its status. The single choke point for every order-money write, so
 * the invariant is checked in exactly one place and the derived order status can
 * never lag the ledger.
 */
async function applyOrderDelta(order: Order, delta: LedgerDelta): Promise<void> {
  const current = ledgerOf(order);
  assertMoneyInvariant({
    authorizedPaise: current.authorizedPaise + (delta.authorizedPaise ?? 0),
    capturedPaise: current.capturedPaise + (delta.capturedPaise ?? 0),
    voidedPaise: current.voidedPaise + (delta.voidedPaise ?? 0),
    refundedPaise: current.refundedPaise + (delta.refundedPaise ?? 0),
  });
  const data: Record<string, { increment: number }> = {};
  for (const key of ["authorizedPaise", "capturedPaise", "voidedPaise", "refundedPaise"] as const) {
    const amount = delta[key];
    if (amount) data[key] = { increment: amount };
  }
  await prisma.order.update({ where: { id: order.id }, data });
  await recomputeOrderStatus(order.id);
}

// ─── Pay now (capture) ───────────────────────────────────────────────────────

export type CapturePaymentResult = EngineResult<{
  paymentStatus: string;
  amountPaise: number;
  alreadyPaid: boolean;
}>;

function payable(booking: Pick<Booking, "assignedPartnerId" | "status">): boolean {
  return Boolean(booking.assignedPartnerId) && ["ASSIGNED", "PROVIDER_ARRIVING"].includes(booking.status);
}

/**
 * Flip a not-yet-settled booking to a paid state. Conditional updateMany acts as
 * a compare-and-swap: two concurrent "Pay now" calls can't both settle the same
 * booking. Returns true if THIS call won the claim, false if it was already
 * settled by a concurrent or earlier call.
 */
async function markBookingPaid(
  bookingId: string,
  paymentStatus: string,
  method: string,
  finalAmountPaise: number,
): Promise<boolean> {
  const res = await prisma.booking.updateMany({
    where: { id: bookingId, paymentStatus: { notIn: ["PAID", "COD"] } },
    data: { paymentStatus, paymentMethod: method, finalAmountPaise },
  });
  return res.count === 1;
}

async function captureAgainstOrder(
  booking: Booking,
  order: Order,
  method: string,
  finalAmountPaise: number,
): Promise<CapturePaymentResult> {
  const capturePaise = bookingCaptureShortfall({
    paymentStatus: booking.paymentStatus,
    quotedAmount: booking.quotedAmount,
    order: ledgerOf(order),
  });

  // Only a real card hold needs a gateway capture; immediate methods were already
  // captured at authorize. Do it before the DB write so the ledger never claims a
  // capture the gateway rejected.
  if (capturePaise > 0 && order.gatewayIntentId) {
    const cap = await getPaymentGateway().capture(order.gatewayIntentId, capturePaise);
    if (!cap.ok) return { ok: false, error: cap.error };
  }

  // Compare-and-swap claim: only the call that flips the booking out of a
  // non-settled state moves the ledger. Without it, two concurrent "Pay now"
  // calls both read PENDING and both increment capturedPaise (double capture).
  // The gateway's own over-capture guard blocks a double *charge* for a real
  // card hold, but an order with no gatewayIntentId has no such backstop — the
  // CAS is what makes the ledger write happen exactly once. A loser returns
  // alreadyPaid instead of re-moving money.
  const claimed = await prisma.booking.updateMany({
    where: { id: booking.id, paymentStatus: { notIn: ["PAID", "COD"] } },
    data: {
      paymentStatus: "PAID",
      paymentMethod: method,
      capturedPaise: { increment: capturePaise },
      finalAmountPaise,
    },
  });
  if (claimed.count === 0) {
    return { ok: true, paymentStatus: "PAID", amountPaise: booking.quotedAmount, alreadyPaid: true };
  }

  await applyOrderDelta(order, { capturedPaise: capturePaise });
  return { ok: true, paymentStatus: "PAID", amountPaise: booking.quotedAmount, alreadyPaid: false };
}

/**
 * Settle the "Pay now" action for an assigned booking. Idempotent: a booking
 * already PAID/COD returns alreadyPaid without moving money. Prepaid methods
 * capture the booking's uncaptured share against its order (via the gateway for a
 * real card hold); COD records the intent to collect on site. Never marks a
 * booking paid without a matching ledger capture, which closes the old "flip to
 * PAID for free" hole.
 */
export async function captureAssignedBookingPayment(
  bookingId: string,
  method: string,
): Promise<CapturePaymentResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found" };

  if (["PAID", "COD"].includes(booking.paymentStatus)) {
    return { ok: true, paymentStatus: booking.paymentStatus, amountPaise: booking.quotedAmount, alreadyPaid: true };
  }
  if (!payable(booking)) {
    return { ok: false, error: "Payment opens after a partner is assigned" };
  }

  const finalAmountPaise = booking.finalAmountPaise ?? booking.quotedAmount;

  if (method === "cod") {
    const won = await markBookingPaid(bookingId, "COD", method, finalAmountPaise);
    return { ok: true, paymentStatus: "COD", amountPaise: booking.quotedAmount, alreadyPaid: !won };
  }

  const order = booking.orderId ? await prisma.order.findUnique({ where: { id: booking.orderId } }) : null;

  // Legacy booking with no Order: no ledger to move, just mark it paid.
  if (!order) {
    const won = await markBookingPaid(bookingId, "PAID", method, finalAmountPaise);
    return { ok: true, paymentStatus: "PAID", amountPaise: booking.quotedAmount, alreadyPaid: !won };
  }

  return captureAgainstOrder(booking, order, method, finalAmountPaise);
}

// ─── Cancellation refund / void ──────────────────────────────────────────────

/** A booking whose money can move: prepaid (has an order) and not COD. */
function hasMovableMoney(booking: Pick<Booking, "orderId" | "paymentStatus">): boolean {
  return Boolean(booking.orderId) && booking.paymentStatus !== "COD";
}

async function refundBookingShare(order: Order, bookingId: string, refundPaise: number): Promise<void> {
  if (order.gatewayIntentId) await getPaymentGateway().refund(order.gatewayIntentId, refundPaise);
  await applyOrderDelta(order, { refundedPaise: refundPaise });
  await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentStatus: "REFUNDED", refundedPaise: refundPaise },
  });
}

async function voidBookingShare(order: Order, voidPaise: number): Promise<void> {
  if (order.gatewayIntentId) await getPaymentGateway().void(order.gatewayIntentId, voidPaise);
  await applyOrderDelta(order, { voidedPaise: voidPaise });
}

/**
 * Return a cancelled booking's money: refund a captured (prepaid) share or void
 * an uncaptured card hold, both net of the retained cancellation fee, then
 * re-derive the order. Moves nothing for COD or never-authorized bookings, so it
 * is a safe no-op for crew/escrow bookings routed through the same cancel path.
 */
export async function settleCancelledBooking(
  bookingId: string,
  feePaise: number,
): Promise<{ refundedPaise: number; voidedPaise: number }> {
  const zero = { refundedPaise: 0, voidedPaise: 0 };
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || !hasMovableMoney(booking)) return zero;

  const order = await prisma.order.findUnique({ where: { id: booking.orderId! } });
  if (!order) return zero;

  const { refundPaise, voidPaise } = computeCancelSettlement({
    paymentStatus: booking.paymentStatus,
    quotedAmount: booking.quotedAmount,
    capturedPaise: booking.capturedPaise,
    feePaise,
    order: ledgerOf(order),
  });

  if (refundPaise > 0) await refundBookingShare(order, bookingId, refundPaise);
  else if (voidPaise > 0) await voidBookingShare(order, voidPaise);

  return { refundedPaise: refundPaise, voidedPaise: voidPaise };
}

// ─── Revised-quote supplementary charge ──────────────────────────────────────

/** Authorize+capture a supplementary charge on the booking's own method. */
async function chargeSupplement(
  method: PaymentMethod,
  amountPaise: number,
  idempotencyKey: string,
): Promise<EngineResult> {
  const gateway = getPaymentGateway();
  const auth = await gateway.authorize({ amountPaise, method, idempotencyKey });
  if (!auth.ok) return { ok: false, error: auth.error };
  // A card hold still needs an explicit capture; immediate methods (UPI/wallet)
  // are already captured the moment they authorize.
  if (authStrategy(method) === "hold") {
    const cap = await gateway.capture(auth.intentId, amountPaise);
    if (!cap.ok) return { ok: false, error: cap.error };
  }
  return { ok: true };
}

/**
 * Charge the customer-approved extra on a revised (extra-parts) quote. In the
 * pay-first model the order was authorized for the original total only, so the
 * delta is a genuine supplementary charge — authorized and captured through the
 * gateway and rolled into the order ledger (authorized += delta, captured +=
 * delta). COD collects the extra on site, so nothing moves up front.
 */
export async function captureRevisionDelta(
  bookingId: string,
  deltaPaise: number,
): Promise<EngineResult<{ capturedPaise: number }>> {
  if (deltaPaise <= 0) return { ok: true, capturedPaise: 0 };

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found" };
  if (booking.paymentStatus === "COD") return { ok: true, capturedPaise: 0 };

  const method = (booking.paymentMethod ?? "upi") as PaymentMethod;
  const charge = await chargeSupplement(method, deltaPaise, `revision:${bookingId}:${deltaPaise}`);
  if (!charge.ok) return { ok: false, error: charge.error };

  const order = booking.orderId ? await prisma.order.findUnique({ where: { id: booking.orderId } }) : null;
  if (order) await applyOrderDelta(order, { authorizedPaise: deltaPaise, capturedPaise: deltaPaise });

  await prisma.booking.update({
    where: { id: bookingId },
    data: { capturedPaise: { increment: deltaPaise } },
  });

  return { ok: true, capturedPaise: deltaPaise };
}
