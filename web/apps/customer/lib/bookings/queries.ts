import { prisma } from "@/lib/db/client";
import {
  ACTIVE_BOOKING_WHERE,
  captureRevisionDelta,
  decrementStock,
  recomputePartnerRating,
  settleCancelledBooking,
  type JobStatus,
} from "@vsolve/db";
import { generateBookingRef } from "@/lib/format";
import { isMarketplaceBooking } from "@/lib/bookings/archetype";
import type { LineItem } from "@/lib/catalog/pricing";
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
  paymentMethod?: string | null;
  scheduleType: string;
  vendorAssignmentMode?: string;
  /** Priced breakdown snapshot — see Booking.lineItems in schema.prisma. */
  lineItems?: LineItem[];
  /**
   * DRAFT for the pay-first flow (invisible and undispatchable until the order
   * authorizes). Defaults to PENDING for legacy callers.
   */
  status?: JobStatus;
}) {
  const bookingRef = generateBookingRef();
  const initialStatus: JobStatus = input.status ?? "PENDING";

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
      lineItems: JSON.stringify(input.lineItems ?? []),
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
      assignedPartner: true,
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
    // ACTIVE_BOOKING_WHERE keeps cart drafts out of the customer's booking list.
    where: { userId, ...ACTIVE_BOOKING_WHERE },
    include: {
      service: { include: { category: true, subCategory: true } },
      address: true,
      vendor: true,
      assignedPartner: true,
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

  const updateData: { status: JobStatus; finalAmountPaise?: number } = {
    status: simulated as JobStatus,
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

  // Return the customer's money: refund a captured prepaid booking or void an
  // uncaptured hold, both net of the retained cancel fee, and re-derive the
  // order. No-op for COD / unpaid / crew-escrow bookings.
  const { refundedPaise } = await settleCancelledBooking(booking.id, feePaise);

  return { success: true as const, feePaise, refundedPaise };
}

/** Customer accepts the provider's revised (extra-parts) quote — adds it to the total. */
export async function approveRevisedQuote(bookingRef: string, userId: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId } });
  if (!booking) return null;
  if (booking.revisedAmountPaise == null) return { error: "Nothing to approve" as const };

  const delta = booking.revisedAmountPaise;

  // Catalog parts behind this revision: claim their stock BEFORE charging, so
  // a sold-out part fails the approval instead of stranding a captured charge.
  const pendingItems = await prisma.bookingProductItem.findMany({
    where: { bookingId: booking.id, status: "PENDING_APPROVAL" },
    include: { product: { select: { name: true } } },
  });
  if (pendingItems.length > 0) {
    try {
      await prisma.$transaction((tx) =>
        decrementStock(
          tx,
          pendingItems.map((i) => ({ productId: i.productId, qty: i.qty })),
        ),
      );
    } catch (e) {
      return { error: e instanceof Error ? e.message : ("Part out of stock" as string) };
    }
  }

  // Charge the approved extra BEFORE raising the total, so finalAmountPaise never
  // outruns what has actually been collected. If the supplementary charge fails,
  // the revision stays pending and the total is unchanged.
  const charge = await captureRevisionDelta(booking.id, delta);
  if (!charge.ok) return { error: charge.error };

  const newTotal = booking.quotedAmount + delta;

  // Approved parts join the invoice snapshot as product lines.
  let lineItems: LineItem[] = [];
  try {
    lineItems = JSON.parse(booking.lineItems) as LineItem[];
  } catch {
    /* keep empty */
  }
  for (const item of pendingItems) {
    lineItems.push({
      key: `product:${item.productId}:${item.id}`,
      label: "Extra part",
      value: item.product.name,
      qty: item.qty,
      unitPaise: item.unitPricePaise,
      totalPaise: item.totalPaise,
      kind: "product",
    });
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        quotedAmount: newTotal,
        finalAmountPaise: newTotal,
        revisedAmountPaise: null,
        revisedReason: null,
        lineItems: JSON.stringify(lineItems),
      },
    }),
    prisma.bookingProductItem.updateMany({
      where: { id: { in: pendingItems.map((i) => i.id) } },
      data: { status: "APPROVED", approvedAt: new Date() },
    }),
  ]);
  return { success: true as const, newTotalPaise: newTotal };
}

export async function declineRevisedQuote(bookingRef: string, userId: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId } });
  if (!booking) return null;
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { revisedAmountPaise: null, revisedReason: null },
    }),
    // Declined parts never reach the invoice; keep the rows for the record.
    prisma.bookingProductItem.updateMany({
      where: { bookingId: booking.id, status: "PENDING_APPROVAL" },
      data: { status: "DECLINED" },
    }),
  ]);
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

  // Refresh the assigned partner's aggregate rating from real reviews.
  if (booking.assignedPartnerId) {
    await recomputePartnerRating(booking.assignedPartnerId);
  }

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
