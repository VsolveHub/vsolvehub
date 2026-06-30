import { prisma } from "@/lib/db/client";
import { generateBookingRef } from "@/lib/format";
import { isMarketplaceBooking } from "@/lib/bookings/archetype";
import {
  BOOKING_STATUSES,
  type AnyBookingStatus,
  STATUS_MESSAGES,
  normalizeBookingStatus,
  isMarketplaceStatus,
} from "@/lib/constants";

const STATUS_INTERVAL_MS = 15_000;

export async function createBooking(input: {
  userId: string;
  serviceId: string;
  addressId: string;
  slot: string;
  quotedAmount: number;
  baseChargePaise: number;
  archetype?: string;
  archetypeDetails?: Record<string, unknown>;
  vendorId?: string;
  issueDescription?: string;
  mediaUrls?: string[];
  paymentStatus: string;
  paymentMethod: string;
  scheduleType: string;
  vendorAssignmentMode?: string;
}) {
  const bookingRef = generateBookingRef();
  const initialStatus = "PENDING";

  const booking = await prisma.booking.create({
    data: {
      bookingRef,
      userId: input.userId,
      serviceId: input.serviceId,
      addressId: input.addressId,
      vendorId: input.vendorId,
      slot: input.slot,
      quotedAmount: input.quotedAmount,
      baseChargePaise: input.baseChargePaise,
      finalAmountPaise: input.quotedAmount,
      archetype: input.archetype ?? "A",
      archetypeDetails: JSON.stringify(input.archetypeDetails ?? {}),
      issueDescription: input.issueDescription ?? "",
      mediaUrls: JSON.stringify(input.mediaUrls ?? []),
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      scheduleType: input.scheduleType,
      vendorAssignmentMode: input.vendorAssignmentMode ?? "auto",
      status: initialStatus,
      statusLogs: {
        create: { status: initialStatus },
      },
    },
    include: {
      service: { include: { category: true, subCategory: true } },
      address: true,
      vendor: true,
    },
  });

  return booking;
}

export async function getBookingByRef(ref: string, userId?: string) {
  return prisma.booking.findFirst({
    where: {
      bookingRef: ref,
      ...(userId ? { userId } : {}),
    },
    include: {
      service: { include: { category: true, subCategory: true } },
      address: true,
      vendor: true,
      assignedProvider: { include: { worker: true, user: true } },
      statusLogs: { orderBy: { createdAt: "asc" } },
      crew: { include: { lead: { select: { fullName: true, phone: true } }, roleRates: true } },
      crewJobDays: {
        orderBy: { dayDate: "asc" },
        include: { clockEvents: { include: { member: { select: { id: true, name: true, role: true } } } } },
      },
    },
  });
}

export { isMarketplaceBooking };

export async function getUserBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: {
      service: { include: { category: true, subCategory: true } },
      address: true,
      vendor: true,
      assignedProvider: { include: { worker: true, user: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getSimulatedStatus(
  createdAt: Date,
  currentStatus: string
): AnyBookingStatus {
  const normalized = normalizeBookingStatus(currentStatus);
  if (isMarketplaceStatus(currentStatus)) {
    return normalized;
  }
  if (normalized === "COMPLETED" || normalized === "CANCELLED") {
    return normalized;
  }

  const activeStatuses: string[] = BOOKING_STATUSES.filter((s) => s !== "CANCELLED");
  const startIndex = Math.max(activeStatuses.indexOf(normalized), 0);
  const elapsed = Date.now() - createdAt.getTime();
  const steps = Math.floor(elapsed / STATUS_INTERVAL_MS);
  const targetIndex = Math.min(startIndex + steps, activeStatuses.length - 1);
  return activeStatuses[targetIndex] as AnyBookingStatus;
}

export async function syncBookingStatus(
  bookingId: string,
  createdAt: Date,
  currentStatus: string
) {
  if (isMarketplaceStatus(currentStatus)) {
    return currentStatus;
  }
  const normalized = normalizeBookingStatus(currentStatus);
  const simulated = getSimulatedStatus(createdAt, normalized);
  if (simulated === normalized) {
    return simulated;
  }

  const updateData: { status: string; finalAmountPaise?: number } = {
    status: simulated,
  };

  if (simulated === "COMPLETED") {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (booking && booking.finalAmountPaise == null) {
      updateData.finalAmountPaise = booking.quotedAmount;
    }
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: updateData,
  });

  const lastLog = await prisma.bookingStatusLog.findFirst({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastLog || lastLog.status !== simulated) {
    await prisma.bookingStatusLog.create({
      data: { bookingId, status: simulated },
    });
  }

  return simulated;
}

/** Flat visit fee once a provider is on the way / on site (compensates the trip). */
export const VISIT_FEE_PAISE = 9900;
const VISIT_FEE_STATUSES = ["ON_THE_WAY", "PROVIDER_ARRIVING", "STARTED"];

/** Fee the customer would pay if they cancel an individual booking right now. */
export function previewIndividualCancelFee(status: string): number {
  return VISIT_FEE_STATUSES.includes(normalizeBookingStatus(status)) ? VISIT_FEE_PAISE : 0;
}

export async function cancelBooking(bookingRef: string, userId: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId } });
  if (!booking) return null;

  const status = normalizeBookingStatus(booking.status);
  if (status === "COMPLETED" || status === "CANCELLED") {
    return { error: "Booking cannot be cancelled" as const };
  }

  // Tiered: free before the provider mobilises, a flat visit fee after.
  const feePaise = previewIndividualCancelFee(status);

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED", cancelFeePaise: feePaise, finalAmountPaise: feePaise, cancelledAt: new Date() },
  });
  await prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "CANCELLED" } });

  return { success: true as const, feePaise };
}

/** Customer accepts the provider's revised (extra-parts) quote — adds it to the total. */
export async function approveRevisedQuote(bookingRef: string, userId: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId } });
  if (!booking) return null;
  if (booking.revisedAmountPaise == null) return { error: "Nothing to approve" as const };

  const newTotal = booking.quotedAmount + booking.revisedAmountPaise;
  await prisma.booking.update({
    where: { id: booking.id },
    data: { quotedAmount: newTotal, finalAmountPaise: newTotal, revisedAmountPaise: null, revisedReason: null },
  });
  return { success: true as const, newTotalPaise: newTotal };
}

export async function declineRevisedQuote(bookingRef: string, userId: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId } });
  if (!booking) return null;
  await prisma.booking.update({
    where: { id: booking.id },
    data: { revisedAmountPaise: null, revisedReason: null },
  });
  return { success: true as const };
}

export async function submitBookingReview(
  bookingRef: string,
  userId: string,
  rating: number,
  review: string
) {
  const booking = await prisma.booking.findFirst({
    where: { bookingRef, userId },
  });

  if (!booking) return null;
  if (normalizeBookingStatus(booking.status) !== "COMPLETED") {
    return { error: "Booking not completed" as const };
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { rating, review },
  });

  return { success: true as const };
}

export function getStatusMessage(status: string) {
  const normalized = normalizeBookingStatus(status);
  return STATUS_MESSAGES[normalized] ?? "Tracking your booking.";
}

export function parseMediaUrls(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}
