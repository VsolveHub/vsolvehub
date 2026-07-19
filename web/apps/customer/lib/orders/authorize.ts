// ─────────────────────────────────────────────────────────────────────────────
// Order authorization — the step between "customer pressed Pay" and "providers
// get offered the job".
//
// Money moves before dispatch, never after. A provider is only ever asked to
// commit to work that is already funded, which is what removes the old
// pay-after-accept race where a partner could accept a job the customer then
// abandoned.
//
// Capture happens later, per booking, when a provider actually accepts — see
// acceptJobOffer in @vsolve/db. Authorization covers the whole order; capture is
// per job, so a two-service order where only one provider turns up captures one
// and voids the other.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/client";
import {
  assertMoneyInvariant,
  authStrategy,
  getPaymentGateway,
  type PaymentMethod,
} from "@vsolve/db";
import { generateOrderRef } from "@/lib/format";

export type AuthorizeOrderInput = {
  userId: string;
  bookingIds: string[];
  amountPaise: number;
  method: PaymentMethod;
  /**
   * Stable across retries of the same checkout so a double-submit reuses the
   * existing order instead of authorizing twice. The DB also enforces this with
   * a unique index.
   */
  idempotencyKey: string;
};

export type AuthorizeOrderResult =
  | { ok: true; orderRef: string; orderId: string; codPending: boolean }
  | { ok: false; error: string };

/**
 * Create (or reuse) an Order, authorize the total, and move its bookings out of
 * DRAFT so they become dispatchable.
 */
export async function authorizeOrder(input: AuthorizeOrderInput): Promise<AuthorizeOrderResult> {
  if (input.bookingIds.length === 0) return { ok: false, error: "Nothing to pay for" };
  if (input.amountPaise <= 0) return { ok: false, error: "Invalid order amount" };

  // Idempotency: a retried submit returns the original order untouched.
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return {
      ok: true,
      orderRef: existing.orderRef,
      orderId: existing.id,
      codPending: existing.paymentState === "COD_PENDING",
    };
  }

  const order = await prisma.order.create({
    data: {
      orderRef: generateOrderRef(),
      userId: input.userId,
      status: "PENDING_PAYMENT",
      paymentState: "NONE",
      paymentMethod: input.method,
      idempotencyKey: input.idempotencyKey,
    },
  });

  const auth = await getPaymentGateway().authorize({
    amountPaise: input.amountPaise,
    method: input.method,
    idempotencyKey: input.idempotencyKey,
  });

  if (!auth.ok) {
    // Leave the order PENDING_PAYMENT and the bookings in DRAFT: the cart
    // survives, nothing dispatches, and the customer can retry or switch method.
    return { ok: false, error: auth.error };
  }

  const strategy = authStrategy(input.method);
  const isCod = strategy === "none";
  // "immediate" methods (UPI, wallet) are captured the moment they authorize;
  // card holds funds and is captured per job on accept.
  const capturedPaise = strategy === "immediate" ? input.amountPaise : 0;
  const authorizedPaise = isCod ? 0 : input.amountPaise;

  assertMoneyInvariant({
    authorizedPaise,
    capturedPaise,
    voidedPaise: 0,
    refundedPaise: 0,
  });

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: isCod ? "AUTHORIZED" : "AUTHORIZED",
        paymentState: auth.state,
        gatewayIntentId: auth.intentId,
        authorizedPaise,
        capturedPaise,
        authorizedAt: new Date(),
        authExpiresAt: auth.expiresAt,
      },
    }),
    prisma.booking.updateMany({
      where: { id: { in: input.bookingIds }, userId: input.userId },
      data: {
        orderId: order.id,
        status: "AUTHORIZED",
        paymentMethod: input.method,
        // COD needs no hold, so the partner gate ("PAID" or "COD") is satisfied
        // up front. Prepaid stays PENDING until its per-job capture on accept.
        paymentStatus: isCod ? "COD" : strategy === "immediate" ? "PAID" : "PENDING",
      },
    }),
  ]);

  return { ok: true, orderRef: order.orderRef, orderId: order.id, codPending: isCod };
}
