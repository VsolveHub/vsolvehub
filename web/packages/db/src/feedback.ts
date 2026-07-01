// ─────────────────────────────────────────────────────────────────────────────
// Two-sided feedback. Customer rates the partner; partner rates the customer.
// Aggregate ratings are recomputed from the real review rows — never guessed.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "./client";
import type { EngineResult } from "./fulfillment";

/** Recompute Partner.rating as the average of all their reviewed bookings. */
export async function recomputePartnerRating(partnerId: string): Promise<void> {
  const agg = await prisma.booking.aggregate({
    where: { assignedPartnerId: partnerId, rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  if (agg._count.rating > 0 && agg._avg.rating != null) {
    await prisma.partner.update({
      where: { id: partnerId },
      data: { rating: Math.round(agg._avg.rating * 10) / 10 },
    });
  }
}

/** Recompute User.rating as the average of all partner ratings of this customer. */
export async function recomputeCustomerRating(userId: string): Promise<void> {
  const agg = await prisma.booking.aggregate({
    where: { userId, customerRating: { not: null } },
    _avg: { customerRating: true },
    _count: { customerRating: true },
  });
  if (agg._count.customerRating > 0 && agg._avg.customerRating != null) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        rating: Math.round(agg._avg.customerRating * 10) / 10,
        ratingCount: agg._count.customerRating,
      },
    });
  }
}

/**
 * Customer reviews a completed job. Writes the review and refreshes the
 * assigned partner's aggregate rating.
 */
export async function submitCustomerReview(params: {
  bookingId: string;
  userId: string;
  rating: number;
  review?: string;
}): Promise<EngineResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, userId: params.userId },
  });
  if (!booking) return { ok: false, error: "Booking not found" };
  if (booking.status !== "COMPLETED") return { ok: false, error: "Booking not completed" };

  await prisma.booking.update({
    where: { id: booking.id },
    data: { rating: params.rating, review: params.review ?? null },
  });
  if (booking.assignedPartnerId) await recomputePartnerRating(booking.assignedPartnerId);
  return { ok: true };
}

/**
 * Partner reviews the customer after a completed job. Writes the review and
 * refreshes the customer's aggregate rating.
 */
export async function submitPartnerReviewOfCustomer(params: {
  bookingId: string;
  partnerId: string;
  rating: number;
  review?: string;
}): Promise<EngineResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, assignedPartnerId: params.partnerId },
  });
  if (!booking) return { ok: false, error: "Job not found" };
  if (booking.status !== "COMPLETED") return { ok: false, error: "Job not completed" };

  await prisma.booking.update({
    where: { id: booking.id },
    data: { customerRating: params.rating, customerReview: params.review ?? null },
  });
  await recomputeCustomerRating(booking.userId);
  return { ok: true };
}
