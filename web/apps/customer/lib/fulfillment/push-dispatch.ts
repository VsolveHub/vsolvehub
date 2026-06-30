import { prisma } from "@/lib/db/client";
import { offerExpiresAt } from "@/lib/provider/queries";
import { providerTypeForArchetype, usesPushDispatch } from "@/lib/bookings/archetype";

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
  provider: { worker: { lat: number; lng: number } | null },
  addrLat: number,
  addrLng: number
): boolean {
  if (!provider.worker) return true;
  return haversineKm(provider.worker.lat, provider.worker.lng, addrLat, addrLng) <= SERVICE_RADIUS_KM;
}

async function findEligibleProviders(bookingId: string, excludeProviderIds: string[]) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { address: true },
  });
  if (!booking) return [];

  const providerType = providerTypeForArchetype(booking.archetype);
  const addrLat = booking.address.lat ?? 17.385;
  const addrLng = booking.address.lng ?? 78.4867;

  const providers = await prisma.provider.findMany({
    where: {
      providerType,
      status: "ACTIVE",
      onboardingCompleted: true,
      id: { notIn: excludeProviderIds },
      ...(providerType === "CAPTAIN" ? { worker: { isOnline: true } } : {}),
    },
    include: { worker: true, availability: true },
    take: 50,
  });

  return providers
    .filter(
      (p) =>
        slotMatchesAvailability(booking.slot, p.availability) &&
        withinServiceArea(p, addrLat, addrLng)
    )
    .slice(0, WAVE_SIZE);
}

async function markNoWorkerFound(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.assignedProviderId || booking.status === "NO_WORKER_FOUND") return;

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
  if (booking.assignedProviderId) return { offersCreated: 0 };
  if (["COMPLETED", "CANCELLED", "NO_WORKER_FOUND"].includes(booking.status)) {
    return { offersCreated: 0 };
  }

  const existingOffers = await prisma.jobAssignment.findMany({
    where: { bookingId },
    select: { providerId: true, status: true },
  });

  const pendingCount = existingOffers.filter((o) => o.status === "PENDING").length;
  if (pendingCount > 0) return { offersCreated: 0, pending: pendingCount };

  const offeredProviderIds = existingOffers.map((o) => o.providerId);
  const waveCount = offeredProviderIds.length > 0 ? Math.ceil(offeredProviderIds.length / WAVE_SIZE) : 0;
  if (waveCount >= MAX_WAVES) {
    await markNoWorkerFound(bookingId);
    return { offersCreated: 0, exhausted: true };
  }

  const eligible = await findEligibleProviders(bookingId, offeredProviderIds);
  if (eligible.length === 0) {
    if (offeredProviderIds.length > 0 || waveCount > 0) {
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
      providerId: p.id,
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
  if (!booking || booking.assignedProviderId || !usesPushDispatch(booking.archetype)) return;
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
  if (!booking || booking.assignedProviderId) return { ok: false as const, error: "Already assigned" };
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

export async function acceptOffer(assignmentId: string, providerId: string) {
  const assignment = await prisma.jobAssignment.findFirst({
    where: { id: assignmentId, providerId, status: "PENDING" },
    include: { booking: true },
  });
  if (!assignment) return { ok: false as const, error: "Offer not found or expired" };

  if (assignment.expiresAt < new Date()) {
    await prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    await processExpiredOffersAndRedispatch(assignment.bookingId);
    return { ok: false as const, error: "Offer expired" };
  }

  const alreadyAssigned = await prisma.booking.findFirst({
    where: { id: assignment.bookingId, assignedProviderId: { not: null } },
  });
  if (alreadyAssigned?.assignedProviderId) {
    await prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    return { ok: false as const, error: "Job already taken" };
  }

  const now = new Date();
  const bookingRef = assignment.booking.bookingRef;

  await prisma.$transaction([
    prisma.jobAssignment.update({
      where: { id: assignmentId },
      data: { status: "ACCEPTED", respondedAt: now },
    }),
    prisma.jobAssignment.updateMany({
      where: {
        bookingId: assignment.bookingId,
        id: { not: assignmentId },
        status: "PENDING",
      },
      data: { status: "EXPIRED", respondedAt: now },
    }),
    prisma.booking.update({
      where: { id: assignment.bookingId },
      data: { assignedProviderId: providerId, status: "ASSIGNED" },
    }),
    prisma.bookingStatusLog.create({
      data: { bookingId: assignment.bookingId, status: "ASSIGNED" },
    }),
  ]);

  return { ok: true as const, bookingId: assignment.bookingId, bookingRef };
}

export async function declineOffer(assignmentId: string, providerId: string) {
  const assignment = await prisma.jobAssignment.findFirst({
    where: { id: assignmentId, providerId, status: "PENDING" },
  });
  if (!assignment) return false;

  await prisma.jobAssignment.update({
    where: { id: assignmentId },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  await processExpiredOffersAndRedispatch(assignment.bookingId);
  return true;
}
