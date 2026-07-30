import { prisma } from "@/lib/db/client";
import { authorizeOrder } from "@/lib/orders/authorize";
import { assignBestPartner, failBookingNoProviders } from "@/lib/fulfillment/assign";
import { decrementStock, type PaymentMethod } from "@vsolve/db";
import { cartTotalPaise, summarizeCheckout, type AssignItemResult } from "./summary";
import type { CheckoutResult } from "./types";

type DraftItem = {
  id: string;
  bookingRef: string;
  quotedAmount: number;
  serviceName: string;
  preferredPartnerId?: string | null;
  slotConfirmed: boolean;
};

export type CheckoutDeps = {
  loadDrafts: (userId: string) => Promise<DraftItem[]>;
  /** Atomically claim catalog stock for every product add-on in the cart.
   *  Throws (with a customer-readable message) when something ran out. */
  reserveStock: (bookingIds: string[]) => Promise<void>;
  preflight?: (bookingId: string, preferredPartnerId?: string | null) => Promise<boolean>;
  authorize: typeof authorizeOrder;
  assign: (
    bookingId: string,
    preferredPartnerId?: string | null,
  ) => Promise<{ ok: boolean; partner?: { name: string } }>;
  fail: (bookingId: string) => Promise<{ refunded: boolean }>;
};

const defaultDeps: CheckoutDeps = {
  loadDrafts: async (userId) => {
    const rows = await prisma.booking.findMany({
      where: { userId, status: "DRAFT" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        bookingRef: true,
        quotedAmount: true,
        preferredPartnerId: true,
        archetypeDetails: true,
        service: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      bookingRef: r.bookingRef,
      quotedAmount: r.quotedAmount,
      serviceName: r.service.name,
      preferredPartnerId: r.preferredPartnerId,
      slotConfirmed: (() => {
        try {
          const parsed = JSON.parse(r.archetypeDetails || "{}");
          return Boolean(parsed?.slotConfirmed);
        } catch {
          return false;
        }
      })(),
    }));
  },
  reserveStock: async (bookingIds) => {
    const items = await prisma.bookingProductItem.findMany({
      where: { bookingId: { in: bookingIds }, status: "APPROVED" },
      select: { productId: true, qty: true },
    });
    if (items.length === 0) return;
    // Aggregate per product so two cart items with the same part decrement once.
    const byProduct = new Map<string, number>();
    for (const it of items) byProduct.set(it.productId, (byProduct.get(it.productId) ?? 0) + it.qty);
    await prisma.$transaction((tx) =>
      decrementStock(
        tx,
        [...byProduct.entries()].map(([productId, qty]) => ({ productId, qty })),
      ),
    );
  },
  authorize: authorizeOrder,
  preflight: async (bookingId, preferredPartnerId) => {
    const res = await assignBestPartner(bookingId, {
      preferredPartnerId: preferredPartnerId ?? undefined,
      dryRun: true,
    });
    return res.ok;
  },
  assign: async (bookingId, preferredPartnerId) => {
    const res = await assignBestPartner(bookingId, {
      preferredPartnerId: preferredPartnerId ?? undefined,
    });
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
  if (drafts.some((draft) => !draft.slotConfirmed)) {
    return { ok: false, error: "Choose a slot for every service before paying." };
  }

  const ids = drafts.map((d) => d.id);

  // Availability is a hard gate before stock reservation or payment. Slot
  // selection performs the same check for immediate feedback; this server-side
  // preflight protects checkout from stale clients and expired availability.
  if (deps.preflight) {
    const availability = await Promise.all(
      drafts.map((draft) => deps.preflight!(draft.id, draft.preferredPartnerId)),
    );
    if (availability.some((isAvailable) => !isAvailable)) {
      return {
        ok: false,
        error: "A selected slot is no longer available. Choose another time before paying.",
      };
    }
  }

  // Claim product stock BEFORE money moves — a sold-out part must fail the
  // checkout cleanly rather than strand an authorized order.
  try {
    await deps.reserveStock(ids);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "A product in your cart is out of stock" };
  }

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
    const a = await deps.assign(d.id, d.preferredPartnerId);
    if (a.ok) {
      results.push({ bookingRef: d.bookingRef, serviceName: d.serviceName, assigned: true, partnerName: a.partner?.name });
    } else {
      const { refunded } = await deps.fail(d.id);
      results.push({ bookingRef: d.bookingRef, serviceName: d.serviceName, assigned: false, refunded });
    }
  }

  if (results.some((result) => !result.assigned)) {
    return {
      ok: false,
      error: "A professional became unavailable during checkout. You were not charged.",
    };
  }

  return { ok: true, orderRef: authorized.orderRef, items: summarizeCheckout(results) };
}
