// ─────────────────────────────────────────────────────────────────────────────
// LEGACY offer/accept wave dispatch. Superseded by direct assignment
// (lib/fulfillment/assign.ts) for every archetype-A booking created from
// 2026-07-20 onward — see docs/superpowers/plans/2026-07-19-availability-gated-dispatch.md.
//
// Kept only as a safety net: `processExpiredOffersAndRedispatch` is still
// called from the booking-status poll and is a harmless no-op once a booking
// carries an assignedPartnerId (which direct assignment sets immediately).
// `dispatchBookingOffers`/`dispatchDirectOffer`/`retryBookingDispatch` are no
// longer called from the booking-creation or retry paths.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/client";
import { getPaymentGateway, isDispatchable, recomputeOrderStatus } from "@vsolve/db";
import { offerExpiresAt } from "@/lib/provider/queries";
import { usesPushDispatch } from "@/lib/bookings/archetype";
import { candidatePartnerInclude, poolPartners, slotMatchesAvailability } from "@/lib/fulfillment/matching";

const WAVE_SIZE = 5;
const MAX_WAVES = 4;

async function findEligiblePartners(bookingId: string, excludePartnerIds: string[]) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { address: true, service: { include: { subCategory: true } } },
  });
  if (!booking) return [];

  const addrLat = booking.address.lat ?? 17.385;
  const addrLng = booking.address.lng ?? 78.4867;

  const partners = await prisma.partner.findMany({
    where: {
      providerType: "CAPTAIN",
      status: "ACTIVE",
      id: { notIn: excludePartnerIds },
      isOnline: true,
    },
    include: candidatePartnerInclude,
    take: 50,
  });

  const ctx = {
    addrLat,
    addrLng,
    slot: booking.slot,
    scheduleType: booking.scheduleType as "instant" | "scheduled",
    service: booking.service,
  };

  return poolPartners(partners, ctx)
    .filter((p) => slotMatchesAvailability(booking.slot, p.availability))
    .slice(0, WAVE_SIZE);
}

async function markNoWorkerFound(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.assignedPartnerId || booking.status === "NO_WORKER_FOUND") return;

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "NO_WORKER_FOUND" },
  });
  await prisma.bookingStatusLog.create({
    data: { bookingId, status: "NO_WORKER_FOUND" },
  });

  // Nobody took the job, so release its share of the hold. The customer is
  // charged nothing for it, and a multi-service order keeps its other jobs.
  if (booking.orderId && booking.capturedPaise === 0) {
    const order = await prisma.order.findUnique({ where: { id: booking.orderId } });
    if (order && order.authorizedPaise > 0) {
      const releasable = Math.max(
        0,
        order.authorizedPaise - order.capturedPaise - order.voidedPaise,
      );
      const voidPaise = Math.min(booking.quotedAmount, releasable);
      if (voidPaise > 0) {
        if (order.gatewayIntentId) {
          await getPaymentGateway().void(order.gatewayIntentId, voidPaise);
        }
        await prisma.order.update({
          where: { id: order.id },
          data: { voidedPaise: { increment: voidPaise } },
        });
      }
    }
    await recomputeOrderStatus(booking.orderId);
  }
}

export async function dispatchBookingOffers(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("Booking not found");
  if (!usesPushDispatch(booking.archetype)) return { offersCreated: 0 };
  if (booking.assignedPartnerId) return { offersCreated: 0 };
  // Covers terminal states AND cart drafts: an unpaid draft must never reach a
  // provider, since no money has been authorized for it.
  if (!isDispatchable(booking.status)) return { offersCreated: 0 };

  const existingOffers = await prisma.jobAssignment.findMany({
    where: { bookingId },
    select: { partnerId: true, status: true },
  });

  const pendingCount = existingOffers.filter((o) => o.status === "PENDING").length;
  if (pendingCount > 0) return { offersCreated: 0, pending: pendingCount };

  const offeredPartnerIds = existingOffers.map((o) => o.partnerId);
  const waveCount = offeredPartnerIds.length > 0 ? Math.ceil(offeredPartnerIds.length / WAVE_SIZE) : 0;
  if (waveCount >= MAX_WAVES) {
    await markNoWorkerFound(bookingId);
    return { offersCreated: 0, exhausted: true };
  }

  const eligible = await findEligiblePartners(bookingId, offeredPartnerIds);
  if (eligible.length === 0) {
    if (offeredPartnerIds.length > 0 || waveCount > 0) {
      await markNoWorkerFound(bookingId);
      return { offersCreated: 0, exhausted: true };
    }
    await markNoWorkerFound(bookingId);
    return { offersCreated: 0, exhausted: true };
  }

  const expiresAt = offerExpiresAt();
  await prisma.jobAssignment.createMany({
    data: eligible.map((p) => ({
      bookingId,
      partnerId: p.id,
      status: "PENDING",
      expiresAt,
    })),
  });

  if (!["SEARCHING_PROVIDER", "ASSIGNED"].includes(booking.status)) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "SEARCHING_PROVIDER" },
    });
    await prisma.bookingStatusLog.create({
      data: { bookingId, status: "SEARCHING_PROVIDER" },
    });
  }

  return { offersCreated: eligible.length, expiresAt: expiresAt.toISOString() };
}

export async function processExpiredOffersAndRedispatch(bookingId: string) {
  const now = new Date();
  await prisma.jobAssignment.updateMany({
    where: { bookingId, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED", respondedAt: now },
  });

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.assignedPartnerId || !usesPushDispatch(booking.archetype)) return;
  if (!["PENDING", "SEARCHING_PROVIDER"].includes(booking.status)) return;

  const pending = await prisma.jobAssignment.count({
    where: { bookingId, status: "PENDING", expiresAt: { gt: now } },
  });
  if (pending === 0) {
    await dispatchBookingOffers(bookingId);
  }
}

export async function retryBookingDispatch(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.assignedPartnerId) return { ok: false as const, error: "Already assigned" };
  if (booking.status !== "NO_WORKER_FOUND") {
    return { ok: false as const, error: "Cannot retry this booking" };
  }

  await prisma.jobAssignment.deleteMany({
    where: { bookingId, status: { not: "ACCEPTED" } },
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "PENDING" },
  });
  await prisma.bookingStatusLog.create({
    data: { bookingId, status: "PENDING" },
  });

  const result = await dispatchBookingOffers(bookingId);
  return { ok: true as const, ...result };
}

// Offer accept/decline now live in the shared @vsolve/db fulfillment engine
// (acceptJobOffer / declineJobOffer). Re-dispatch on decline/expiry happens via
// processExpiredOffersAndRedispatch, triggered on the next customer status poll.
