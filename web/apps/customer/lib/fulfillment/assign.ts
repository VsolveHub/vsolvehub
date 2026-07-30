// ─────────────────────────────────────────────────────────────────────────────
// Direct assignment (Urban-Company-style): pick the best available professional
// and put the job on their schedule. No offer, no accept prompt. The customer
// leaves checkout already knowing who is coming.
//
// The ranked list comes from the shared matcher (matching.ts); this module walks
// it, calling the conflict-safe engine (assignPartnerDirect in @vsolve/db) until
// one candidate assigns cleanly. Concurrent checkouts for the same partner+slot
// collide on a partial unique index — the loser sees SLOT_TAKEN and we simply
// move to the next candidate. Exhausting the list means genuinely nobody is
// free, which after payment triggers a full refund/void (failBookingNoProviders).
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/client";
import {
  assignPartnerDirect,
  getPaymentGateway,
  recomputeOrderStatus,
  type EngineResult,
} from "@vsolve/db";
import { findAvailablePartners, type PublicPartner } from "@/lib/fulfillment/matching";
import { suggestSlots, type SlotSuggestion } from "@/lib/fulfillment/slot-suggestions";

// Falls back to Hyderabad centre when an address has no geocode, matching the
// rest of the dispatch code — a missing pin should not silently exclude a city.
const DEFAULT_LAT = 17.385;
const DEFAULT_LNG = 78.4867;

export type AssignOutcome =
  | { ok: true; partner: PublicPartner; startOtp: string; preferredHonored: boolean }
  | { ok: false; code: "NO_PROVIDERS"; suggestedSlots: SlotSuggestion[] };

/**
 * Move the customer's chosen professional to the front of the ranked list, if
 * they are still eligible. Pure. When the preferred id is absent (already taken,
 * or the customer chose auto) the matcher's own ranking is used unchanged, which
 * is exactly the silent-fallback behaviour: we try their pick first, then the
 * next best.
 */
export function orderPreferredFirst<T extends { id: string }>(
  ranked: T[],
  preferredPartnerId?: string,
): T[] {
  if (!preferredPartnerId) return ranked;
  const preferred = ranked.find((c) => c.id === preferredPartnerId);
  if (!preferred) return ranked;
  return [preferred, ...ranked.filter((c) => c.id !== preferredPartnerId)];
}

/** The engine call, injected so the ordering logic below is unit-testable. */
export type AssignAttempt = (partnerId: string) => Promise<EngineResult<{ startOtp: string }>>;

/**
 * Pure candidate walk: assign the first professional who doesn't collide. A
 * SLOT_TAKEN (someone grabbed this partner+slot mid-loop) falls through to the
 * next candidate; any other engine failure is abnormal (booking already taken or
 * terminal) and stops the loop. Returns the winning partner id + start OTP, or
 * ok:false when the list is exhausted.
 */
export async function assignFirstAvailable(
  ranked: { id: string }[],
  attempt: AssignAttempt,
): Promise<{ ok: true; partnerId: string; startOtp: string } | { ok: false }> {
  for (const candidate of ranked) {
    const result = await attempt(candidate.id);
    if (result.ok) return { ok: true, partnerId: candidate.id, startOtp: result.startOtp };
    if (result.error !== "SLOT_TAKEN") break;
  }
  return { ok: false };
}

async function loadPublicPartner(partnerId: string): Promise<PublicPartner> {
  const p = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, fullName: true, rating: true, jobsCompleted: true },
  });
  return {
    id: partnerId,
    name: p?.fullName ?? "Your professional",
    rating: p?.rating ?? 5,
    jobsCompleted: p?.jobsCompleted ?? 0,
  };
}

/**
 * Assign the best available professional to a booking. Loads and ranks
 * candidates via the shared matcher, then walks them through the conflict-safe
 * engine. On failure returns suggested alternative slots computed from the same
 * candidate pool — no extra query.
 */
export async function assignBestPartner(
  bookingId: string,
  opts: {
    excludePartnerIds?: string[];
    preferredPartnerId?: string;
    dryRun?: boolean;
  } = {},
): Promise<AssignOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { address: true, service: { include: { subCategory: true } } },
  });
  if (!booking) return { ok: false, code: "NO_PROVIDERS", suggestedSlots: [] };

  const ctx = {
    addrLat: booking.address.lat ?? DEFAULT_LAT,
    addrLng: booking.address.lng ?? DEFAULT_LNG,
    slot: booking.slot,
    scheduleType: booking.scheduleType as "instant" | "scheduled",
    durationMinutes: booking.durationMinutes,
    service: booking.service,
  };

  const { ranked, pool } = await findAvailablePartners({
    service: booking.service,
    addrLat: ctx.addrLat,
    addrLng: ctx.addrLng,
    slot: booking.slot,
    scheduleType: ctx.scheduleType,
    durationMinutes: booking.durationMinutes,
    excludePartnerIds: opts.excludePartnerIds,
  });

  const ordered = orderPreferredFirst(ranked, opts.preferredPartnerId);
  if (opts.dryRun) {
    const first = ordered[0];
    if (!first) {
      return { ok: false, code: "NO_PROVIDERS", suggestedSlots: suggestSlots(pool, ctx) };
    }
    const partner = await loadPublicPartner(first.id);
    return {
      ok: true,
      partner,
      startOtp: "",
      preferredHonored: Boolean(opts.preferredPartnerId && first.id === opts.preferredPartnerId),
    };
  }
  const outcome = await assignFirstAvailable(ordered, (pid) => assignPartnerDirect(bookingId, pid));
  if (!outcome.ok) {
    return { ok: false, code: "NO_PROVIDERS", suggestedSlots: suggestSlots(pool, ctx) };
  }

  const partner = await loadPublicPartner(outcome.partnerId);
  const preferredHonored = !!opts.preferredPartnerId && outcome.partnerId === opts.preferredPartnerId;
  return { ok: true, partner, startOtp: outcome.startOtp, preferredHonored };
}

/**
 * A partner bailed ("Can't make it") and releasePartnerAssignment already freed
 * the slot. Try to reassign, excluding everyone who has declined this booking so
 * far. If nobody else is free, fall to the terminal refund path — the customer
 * gets their money back in full and the booking ends NO_WORKER_FOUND.
 */
export async function reassignAfterRelease(bookingId: string): Promise<void> {
  const declined = await prisma.jobAssignment.findMany({
    where: { bookingId, status: "DECLINED" },
    select: { partnerId: true },
  });
  const excludePartnerIds = [...new Set(declined.map((d) => d.partnerId))];

  const outcome = await assignBestPartner(bookingId, { excludePartnerIds });
  if (!outcome.ok) await failBookingNoProviders(bookingId);
}

/**
 * Driven by the customer's tracker poll. A booking sits in SEARCHING_PROVIDER
 * with no one assigned only after a partner bailed ("Can't make it") — direct
 * assignment never leaves it there otherwise. When we see that state, run the
 * reassignment. Safe to call on any booking: it acts only on that exact state,
 * so it is a no-op for the happy ASSIGNED path and for terminal bookings.
 */
export async function driveReassignmentIfPending(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, assignedPartnerId: true, archetype: true },
  });
  if (!booking || booking.assignedPartnerId) return;
  if (booking.archetype !== "A" || booking.status !== "SEARCHING_PROVIDER") return;
  await reassignAfterRelease(bookingId);
}

/**
 * Terminal path when assignment cannot produce a professional after money has
 * moved: refund (captured) or void (uncaptured hold) this booking's share in
 * full, mark it NO_WORKER_FOUND, and re-derive the order. Idempotent — a booking
 * already terminal or assigned is left untouched. Returns whether money was
 * returned, so the API can tell the customer "you have not been charged".
 */
export async function failBookingNoProviders(bookingId: string): Promise<{ refunded: boolean }> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.assignedPartnerId) return { refunded: false };
  if (["NO_WORKER_FOUND", "COMPLETED", "CANCELLED"].includes(booking.status)) {
    return { refunded: false };
  }

  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: "NO_WORKER_FOUND" } }),
    prisma.bookingStatusLog.create({ data: { bookingId, status: "NO_WORKER_FOUND" } }),
  ]);

  let refunded = false;
  if (booking.orderId && booking.paymentStatus !== "COD") {
    const order = await prisma.order.findUnique({ where: { id: booking.orderId } });
    if (order) {
      const gateway = getPaymentGateway();
      if (booking.paymentStatus === "PENDING") {
        // Card hold, never captured for this job → void its share of the hold.
        const releasable = Math.max(
          0,
          order.authorizedPaise - order.capturedPaise - order.voidedPaise,
        );
        const voidPaise = Math.min(booking.quotedAmount, releasable);
        if (voidPaise > 0) {
          if (order.gatewayIntentId) await gateway.void(order.gatewayIntentId, voidPaise);
          await prisma.order.update({
            where: { id: order.id },
            data: { voidedPaise: { increment: voidPaise } },
          });
        }
      } else {
        // Captured (immediate method at authorize, or card captured at assign) →
        // refund this booking's share in full.
        const capturedForBooking =
          booking.capturedPaise > 0 ? booking.capturedPaise : booking.quotedAmount;
        const refundable = Math.max(0, order.capturedPaise - order.refundedPaise);
        const refundPaise = Math.min(capturedForBooking, refundable);
        if (refundPaise > 0) {
          if (order.gatewayIntentId) await gateway.refund(order.gatewayIntentId, refundPaise);
          await prisma.order.update({
            where: { id: order.id },
            data: { refundedPaise: { increment: refundPaise } },
          });
          await prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: "REFUNDED", refundedPaise: refundPaise },
          });
          refunded = true;
        }
      }
    }
    await recomputeOrderStatus(booking.orderId);
  }

  return { refunded };
}
