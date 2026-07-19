import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
  getBookingByRef,
  getStatusMessage,
  isMarketplaceBooking,
  parseMediaUrls,
  previewIndividualCancelFee,
} from "@/lib/bookings/queries";
import {
  BOOKING_STATUSES,
  MARKETPLACE_TIMELINE,
  normalizeBookingStatus,
} from "@/lib/constants";
import { driveReassignmentIfPending } from "@/lib/fulfillment/assign";
import { isCrewBooking, expireCrewOffers, previewCancelFee } from "@/lib/crew/queries";
import { CREW_STATUS_MESSAGES, roleRatePaise } from "@/lib/crew/constants";

type RouteContext = { params: Promise<{ ref: string }> };

function parseRoles(raw: string): { roleId: string; count: number }[] {
  try {
    const d = JSON.parse(raw);
    const roles = Array.isArray(d?.roles) ? d.roles : [];
    return roles
      .filter((r: unknown): r is { roleId: string; count: number } =>
        Boolean(r) && typeof (r as { roleId?: unknown }).roleId === "string",
      )
      .map((r: { roleId: string; count: number }) => ({ roleId: r.roleId, count: Number(r.count) || 0 }));
  } catch {
    return [];
  }
}

function serializeCrewBooking(booking: NonNullable<Awaited<ReturnType<typeof getBookingByRef>>>) {
  const roles = parseRoles(booking.archetypeDetails);
  const todayISO = new Date().toISOString().slice(0, 10);
  const rescheduleLimitReached = booking.rescheduleCount >= 2;
  const bookingReschedulable =
    !["COMPLETED", "CANCELLED", "NO_CREW_FOUND", "SEARCHING_CREW"].includes(booking.status) && !rescheduleLimitReached;

  const days = booking.crewJobDays.map((d) => ({
    id: d.id,
    date: d.dayDate,
    status: d.status,
    earnedPaise: d.earnedPaise,
    approvedAt: d.customerApprovedAt,
    rescheduleToDate: d.rescheduleToDate,
    canReschedule: bookingReschedulable && d.status === "SCHEDULED" && !d.rescheduleToDate && d.dayDate > todayISO,
    attendance: d.clockEvents.map((e) => ({
      memberId: e.member.id,
      name: e.member.name,
      role: e.member.role,
      clockInAt: e.clockInAt,
      clockOutAt: e.clockOutAt,
    })),
  }));

  const started = Boolean(booking.startConfirmedAt);

  // Customer-facing OTPs the customer reads to crew members on site.
  // Start code: available once escrow is paid and while the job is live (each day a
  // member can clock in). Finish code: available once work has started, to end a day.
  const escrowPaid = booking.paymentStatus === "ESCROW_HELD";
  const startOtp =
    escrowPaid && ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"].includes(booking.status) ? booking.startOtp : null;
  const endOtp = started && booking.status === "CREW_WORKING" ? booking.endOtp : null;

  // Cancel-fee preview (computed from the crew's rate card).
  const rateFor = (role: string) =>
    booking.crew?.roleRates.find((r) => r.role === role)?.dayRatePaise ?? roleRatePaise(role);
  const dailyRate = roles.reduce((s, r) => s + Math.max(0, r.count) * rateFor(r.roleId), 0);
  const doneEarned = days.filter((d) => ["DAY_DONE", "APPROVED"].includes(d.status)).reduce((s, d) => s + d.earnedPaise, 0);
  const cancellable = !["COMPLETED", "CANCELLED"].includes(booking.status);
  const cancelPreview = cancellable ? previewCancelFee(booking.status, dailyRate, doneEarned) : null;

  // Abandonment / dispute / extension (Phase F).
  const firstDayISO = days[0]?.date;
  const canReportNoShow =
    ["CREW_ASSIGNED", "CREW_EN_ROUTE"].includes(booking.status) && !started && Boolean(firstDayISO) && firstDayISO! <= todayISO;
  const canDispute = booking.status === "COMPLETED" && booking.paymentStatus === "PAID";
  const isDisputed = booking.paymentStatus === "DISPUTED";
  const extensionChargePaise = dailyRate * booking.extensionDays;

  return {
    bookingRef: booking.bookingRef,
    status: booking.status,
    message: CREW_STATUS_MESSAGES[booking.status] ?? "Tracking your crew booking.",
    isCrew: true,
    assignmentMode: booking.assignmentMode,
    roles,
    service: {
      id: booking.service.id,
      name: booking.service.name,
      slug: booking.service.slug,
      categorySlug: booking.service.category.slug,
    },
    crew: booking.crew
      ? {
          id: booking.crew.id,
          name: booking.crew.name,
          rating: booking.crew.rating,
          leadName: booking.crew.lead.fullName,
          leadPhone: booking.crew.lead.phone,
        }
      : null,
    days,
    durationDays: booking.durationDays,
    startDate: booking.slot,
    address: booking.address.fullAddress,
    issueDescription: booking.issueDescription,
    mediaUrls: parseMediaUrls(booking.mediaUrls),
    quotedAmount: booking.quotedAmount,
    finalAmountPaise: booking.finalAmountPaise ?? booking.quotedAmount,
    paymentStatus: booking.paymentStatus,
    paymentMethod: booking.paymentMethod,
    escrowPaise: booking.escrowPaise,
    refundedPaise: booking.refundedPaise,
    needsEscrowPayment:
      ["CREW_ASSIGNED", "CREW_EN_ROUTE"].includes(booking.status) && booking.paymentStatus === "PENDING",
    rescheduleCount: booking.rescheduleCount,
    rescheduleLimitReached,
    canReportNoShow,
    canDispute,
    isDisputed,
    extensionDays: booking.extensionDays,
    extensionChargePaise,
    started,
    startOtp,
    endOtp,
    cancellable,
    cancelPreview,
    cancelFeePaise: booking.cancelFeePaise,
    cancelledAt: booking.cancelledAt,
    rating: booking.rating,
    review: booking.review,
    createdAt: booking.createdAt,
  };
}

function serializeProvider(booking: NonNullable<Awaited<ReturnType<typeof getBookingByRef>>>) {
  const partner = booking.assignedPartner;
  if (!partner) return null;

  const name = partner.fullName ?? "Partner";
  const phone = partner.phone;
  const rating = partner.rating;

  const assignedLog = booking.statusLogs.find((l) => l.status === "ASSIGNED");
  const etaMinutes = assignedLog
    ? Math.max(5, 20 - Math.floor((Date.now() - assignedLog.createdAt.getTime()) / 60_000))
    : 15;

  return { id: partner.id, name, phone, rating, etaMinutes };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();

  let booking = await getBookingByRef(ref, session?.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Crew bookings have their own day-wise track — no per-visit status simulation.
  if (isCrewBooking(booking)) {
    if (booking.status === "SEARCHING_CREW") {
      await expireCrewOffers(booking.id);
      booking = (await getBookingByRef(ref, session?.id)) ?? booking;
    }
    return NextResponse.json(serializeCrewBooking(booking));
  }

  const marketplace = isMarketplaceBooking(booking);

  if (marketplace) {
    // Direct assignment: reassign only if a partner bailed (SEARCHING_PROVIDER).
    await driveReassignmentIfPending(booking.id);
    booking = (await getBookingByRef(ref, session?.id)) ?? booking;
  }

  // Status is authoritative from the DB (driven by the partner / dispatch) —
  // never time-simulated.
  const normalized = normalizeBookingStatus(booking.status);
  const provider = serializeProvider(booking);
  const paidForMobilization = ["PAID", "COD"].includes(booking.paymentStatus);

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: normalized,
    message: getStatusMessage(normalized),
    marketplace,
    service: {
      id: booking.service.id,
      name: booking.service.name,
      slug: booking.service.slug,
      categorySlug: booking.service.category.slug,
    },
    issueDescription: booking.issueDescription,
    mediaUrls: parseMediaUrls(booking.mediaUrls),
    slot: booking.slot,
    scheduleType: booking.scheduleType,
    address: booking.address.fullAddress,
    vendor: booking.vendor
      ? {
          id: booking.vendor.id,
          name: booking.vendor.name,
          phone: booking.vendor.phone,
          rating: booking.vendor.rating,
        }
      : null,
    provider,
    // Shown to the customer once a partner is assigned; read aloud to start the job.
    startOtp: paidForMobilization && ["ASSIGNED", "PROVIDER_ARRIVING"].includes(normalized) ? booking.startOtp : null,
    baseChargePaise: booking.baseChargePaise,
    quotedAmount: booking.quotedAmount,
    finalAmountPaise: booking.finalAmountPaise ?? booking.quotedAmount,
    paymentStatus: booking.paymentStatus,
    paymentMethod: booking.paymentMethod,
    cancellable: !["COMPLETED", "CANCELLED"].includes(normalized),
    cancelFeePaise: previewIndividualCancelFee(normalized),
    revisedAmountPaise: booking.revisedAmountPaise,
    revisedReason: booking.revisedReason,
    rating: booking.rating,
    review: booking.review,
    createdAt: booking.createdAt,
    statusLogs: booking.statusLogs,
    statuses: marketplace
      ? [...MARKETPLACE_TIMELINE, "CANCELLED"]
      : BOOKING_STATUSES.filter((s) => s !== "CANCELLED"),
  });
}
