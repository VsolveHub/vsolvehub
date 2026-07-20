import { prisma } from "@/lib/db/client";
import { authorizeOrder } from "@/lib/orders/authorize";
import { assignBestPartner, failBookingNoProviders } from "@/lib/fulfillment/assign";
import type { PaymentMethod } from "@vsolve/db";
import { cartTotalPaise, summarizeCheckout, type AssignItemResult } from "./summary";
import type { CheckoutResult } from "./types";

type DraftItem = { id: string; bookingRef: string; quotedAmount: number; serviceName: string };

export type CheckoutDeps = {
  loadDrafts: (userId: string) => Promise<DraftItem[]>;
  authorize: typeof authorizeOrder;
  assign: (bookingId: string) => Promise<{ ok: boolean; partner?: { name: string } }>;
  fail: (bookingId: string) => Promise<{ refunded: boolean }>;
};

const defaultDeps: CheckoutDeps = {
  loadDrafts: async (userId) => {
    const rows = await prisma.booking.findMany({
      where: { userId, status: "DRAFT" },
      orderBy: { createdAt: "asc" },
      select: { id: true, bookingRef: true, quotedAmount: true, service: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      bookingRef: r.bookingRef,
      quotedAmount: r.quotedAmount,
      serviceName: r.service.name,
    }));
  },
  authorize: authorizeOrder,
  assign: async (bookingId) => {
    const res = await assignBestPartner(bookingId);
    return res.ok ? { ok: true, partner: res.partner } : { ok: false };
  },
  fail: failBookingNoProviders,
};

/**
 * Turn the user's DRAFT cart into booked jobs: authorize ONE order across all
 * items, then auto-assign each independently. An item with no available provider
 * is voided/refunded (its share) while the rest still book. Money moves through
 * the existing Order ledger — this only orchestrates it.
 */
export async function checkoutCart(
  userId: string,
  method: PaymentMethod,
  deps: CheckoutDeps = defaultDeps,
): Promise<CheckoutResult> {
  const drafts = await deps.loadDrafts(userId);
  if (drafts.length === 0) return { ok: false, error: "Your cart is empty" };

  const ids = drafts.map((d) => d.id);
  const authorized = await deps.authorize({
    userId,
    bookingIds: ids,
    amountPaise: cartTotalPaise(drafts),
    method,
    // Stable across a retried checkout of the same cart, so a double-submit reuses
    // the same order instead of authorizing twice.
    idempotencyKey: `cart:${userId}:${[...ids].sort().join(",")}`,
  });
  if (!authorized.ok) return { ok: false, error: authorized.error };

  const results: AssignItemResult[] = [];
  for (const d of drafts) {
    const a = await deps.assign(d.id);
    if (a.ok) {
      results.push({ bookingRef: d.bookingRef, serviceName: d.serviceName, assigned: true, partnerName: a.partner?.name });
    } else {
      const { refunded } = await deps.fail(d.id);
      results.push({ bookingRef: d.bookingRef, serviceName: d.serviceName, assigned: false, refunded });
    }
  }

  return { ok: true, orderRef: authorized.orderRef, items: summarizeCheckout(results) };
}
