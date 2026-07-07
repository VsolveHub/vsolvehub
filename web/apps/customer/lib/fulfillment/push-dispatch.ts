import { prisma } from "@/lib/db/client";
import { offerExpiresAt } from "@/lib/provider/queries";
import { providerTypeForArchetype, usesPushDispatch } from "@/lib/bookings/archetype";
import { partnerMatchesService, partnerMatchInclude } from "@/lib/provider/matching";

const WAVE_SIZE = 5;
const MAX_WAVES = 4;
const SERVICE_RADIUS_KM = 25;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type AvailabilityRow = {
  dayOfWeek: number | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  type: string;
};

function slotMatchesAvailability(slot: string, availability: AvailabilityRow[]): boolean {
  if (availability.length === 0) return true;

  const slotDate = new Date(slot);
  const dow = slotDate.getDay();
  const dateStr = slotDate.toISOString().slice(0, 10);
  const timeStr = slotDate.toTimeString().slice(0, 5);

  const blocks = availability.filter((a) => a.type === "blocked");
  for (const block of blocks) {
    if (block.date === dateStr) return false;
    if (block.dayOfWeek === dow) return false;
  }

  const windows = availability.filter((a) => a.type === "available");
  if (windows.length === 0) return true;

  return windows.some((a) => {
    const dayOk = a.dayOfWeek == null || a.dayOfWeek === dow;
    const dateOk = a.date == null || a.date === dateStr;
    if (!dayOk && !dateOk) return false;
    if (a.startTime && a.endTime) {
      return timeStr >= a.startTime && timeStr <= a.endTime;
    }
    return true;
  });
}

function withinServiceArea(
  partner: { lat: number | null; lng: number | null },
  addrLat: number,
  addrLng: number
): boolean {
  if (partner.lat == null || partner.lng == null) return true;
  return haversineKm(partner.lat, partner.lng, addrLat, addrLng) <= SERVICE_RADIUS_KM;
}

const eligiblePartnerInclude = {
  availability: true,
  ...partnerMatchInclude,
} as const;

async function findEligiblePartners(bookingId: string, excludePartnerIds: string[]) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { address: true, service: { include: { subCategory: true } } },
  });
  if (!booking) return [];

  // Partner.providerType is the enum (CAPTAIN | DRIVER | CLEANER). All four Phase-1
  // dispatch categories (Technician/Beauty/Home/Pet) are archetype A → CAPTAIN;
  // partners are then distinguished by trade/skill, not provider type.
  const providerType = providerTypeForArchetype(booking.archetype);
  const addrLat = booking.address.lat ?? 17.385;
  const addrLng = booking.address.lng ?? 78.4867;

  const partners = await prisma.partner.findMany({
    where: {
      providerType,
      status: "ACTIVE",
      id: { notIn: excludePartnerIds },
      ...(providerType === "CAPTAIN" ? { isOnline: true } : {}),
    },
    include: eligiblePartnerInclude,
    take: 50,
  });

  return partners
    .filter(
      (p) =>
        partnerMatchesService(p, booking.service) &&
        slotMatchesAvailability(booking.slot, p.availability) &&
        withinServiceArea(p, addrLat, addrLng)
    )
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
}

export async function dispatchBookingOffers(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new Error("Booking not found");
  if (!usesPushDispatch(booking.archetype)) return { offersCreated: 0 };
  if (booking.assignedPartnerId) return { offersCreated: 0 };
  if (["COMPLETED", "CANCELLED", "NO_WORKER_FOUND"].includes(booking.status)) {
    return { offersCreated: 0 };
  }

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

/**
 * Direct offer — the customer hand-picked one specific online partner. We create a
 * single offer to just that partner (they can still accept/decline within the TTL).
 * If they decline or let it expire, `processExpiredOffersAndRedispatch` (triggered on
 * the next customer status poll) falls back to a normal auto-dispatch wave, so the
 * booking is never stranded.
 */
export async function dispatchDirectOffer(bookingId: string, partnerId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: { include: { subCategory: true } } },
  });
  if (!booking) return { ok: false as const, error: "Booking not found" };
  if (!usesPushDispatch(booking.archetype)) return { ok: false as const, error: "Not a dispatch service" };
  if (booking.assignedPartnerId) return { ok: false as const, error: "Already assigned" };

  const pending = await prisma.jobAssignment.count({
    where: { bookingId, status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (pending > 0) return { ok: false as const, error: "Offer already outstanding" };

  const partner = await prisma.partner.findFirst({
    where: { id: partnerId, status: "ACTIVE", isOnline: true },
    include: eligiblePartnerInclude,
  });
  if (!partner) return { ok: false as const, error: "Partner is no longer available" };
  if (!partnerMatchesService(partner, booking.service)) {
    return { ok: false as const, error: "Partner does not offer this service" };
  }

  const expiresAt = offerExpiresAt();
  await prisma.$transaction([
    prisma.jobAssignment.create({
      data: { bookingId, partnerId, status: "PENDING", expiresAt },
    }),
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "SEARCHING_PROVIDER" },
    }),
    prisma.bookingStatusLog.create({
      data: { bookingId, status: "SEARCHING_PROVIDER" },
    }),
  ]);

  return { ok: true as const, offersCreated: 1, expiresAt: expiresAt.toISOString() };
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
