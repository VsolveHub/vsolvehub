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
type Booking = NonNullable<Awaited<ReturnType<typeof getBookingByRef>>>;
type CrewRole = { roleId: string; count: number };

// Statuses in which a crew booking can no longer be rescheduled at all.
const CREW_LOCKED_STATUSES = ["COMPLETED", "CANCELLED", "NO_CREW_FOUND", "SEARCHING_CREW"];
// Statuses where the crew is dispatched but the job hasn't started yet.
const CREW_PRE_START_STATUSES = ["CREW_ASSIGNED", "CREW_EN_ROUTE"];

function parseRoles(raw: string): CrewRole[] {
  try {
    const d = JSON.parse(raw);
    const roles = Array.isArray(d?.roles) ? d.roles : [];
    return roles
      .filter((r: unknown): r is CrewRole =>
        Boolean(r) && typeof (r as { roleId?: unknown }).roleId === "string",
      )
      .map((r: CrewRole) => ({ roleId: r.roleId, count: Number(r.count) || 0 }));
  } catch {
    return [];
  }
}

function mapCrewDays(booking: any, reschedulable: boolean, todayISO: string) {
  return (booking.crewJobDays || []).map((d: any) => ({
    id: d.id,
    date: d.dayDate,
    status: d.status,
    earnedPaise: d.earnedPaise,
    approvedAt: d.customerApprovedAt,
    rescheduleToDate: d.rescheduleToDate,
    canReschedule: reschedulable && d.status === "SCHEDULED" && !d.rescheduleToDate && d.dayDate > todayISO,
    attendance: (d.clockEvents || []).map((e: any) => ({
      memberId: e.member?.id,
      name: e.member?.name,
      role: e.member?.role,
      clockInAt: e.clockInAt,
      clockOutAt: e.clockOutAt,
    })),
  }));
}
type CrewDay = ReturnType<typeof mapCrewDays>[number];

function mapCrew(booking: any) {
  const crew = booking.crew;
  if (!crew) return null;
  return {
    id: crew.id,
    name: crew.name,
    rating: crew.rating,
    leadName: crew.lead?.fullName || "Lead",
    leadPhone: crew.lead?.phone || "",
  };
}

// Customer-facing OTPs the customer reads to crew members on site.
// Start code: available once escrow is paid and while the job is live (each day a
// member can clock in). Finish code: available once work has started, to end a day.
function crewOtps(booking: Booking, started: boolean) {
  const escrowPaid = booking.paymentStatus === "ESCROW_HELD";
  const startLive = ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"].includes(booking.status);
  return {
    startOtp: escrowPaid && startLive ? booking.startOtp : null,
    endOtp: started && booking.status === "CREW_WORKING" ? booking.endOtp : null,
  };
}

// Cancel-fee preview computed from the crew's rate card.
function crewPricing(booking: any, roles: CrewRole[], days: CrewDay[]) {
  const rateFor = (role: string) =>
    booking.crew?.roleRates?.find((r: any) => r.role === role)?.dayRatePaise ?? roleRatePaise(role);
  const dailyRate = roles.reduce((s, r) => s + Math.max(0, r.count) * rateFor(r.roleId), 0);
  const doneEarned = days
    .filter((d) => ["DAY_DONE", "APPROVED"].includes(d.status))
    .reduce((s, d) => s + d.earnedPaise, 0);
  const cancellable = !["COMPLETED", "CANCELLED"].includes(booking.status);
  return {
    dailyRate,
    cancellable,
    cancelPreview: cancellable ? previewCancelFee(booking.status, dailyRate, doneEarned) : null,
  };
}

// Escrow / abandonment / dispute flags (Phase F).
function crewStatusFlags(booking: any, started: boolean, firstDayISO: string | undefined, todayISO: string) {
  const preStart = CREW_PRE_START_STATUSES.includes(booking.status);
  return {
    needsEscrowPayment: preStart && booking.paymentStatus === "PENDING",
    canReportNoShow: preStart && !started && Boolean(firstDayISO) && firstDayISO! <= todayISO,
    canDispute: booking.status === "COMPLETED" && booking.paymentStatus === "PAID",
    isDisputed: booking.paymentStatus === "DISPUTED",
  };
}

function serializeCrewBooking(booking: any) {
  const roles = parseRoles(booking.archetypeDetails);
  const todayISO = new Date().toISOString().slice(0, 10);
  const rescheduleLimitReached = booking.rescheduleCount >= 2;
  const reschedulable = !CREW_LOCKED_STATUSES.includes(booking.status) && !rescheduleLimitReached;

  const days = mapCrewDays(booking, reschedulable, todayISO);
  const started = Boolean(booking.startConfirmedAt);
  const { startOtp, endOtp } = crewOtps(booking, started);
  const { dailyRate, cancellable, cancelPreview } = crewPricing(booking, roles, days);
  const flags = crewStatusFlags(booking, started, days[0]?.date, todayISO);

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
    crew: mapCrew(booking),
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
    needsEscrowPayment: flags.needsEscrowPayment,
    rescheduleCount: booking.rescheduleCount,
    rescheduleLimitReached,
    canReportNoShow: flags.canReportNoShow,
    canDispute: flags.canDispute,
    isDisputed: flags.isDisputed,
    extensionDays: booking.extensionDays,
    extensionChargePaise: dailyRate * booking.extensionDays,
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

function serializeProvider(booking: any) {
  const partner = booking.assignedPartner;
  if (!partner) return null;

  const assignedLog = booking.statusLogs?.find((l: any) => l.status === "ASSIGNED");
  const etaMinutes = assignedLog
    ? Math.max(5, 20 - Math.floor((Date.now() - new Date(assignedLog.createdAt).getTime()) / 60_000))
    : 15;

  return { id: partner.id, name: partner.fullName ?? "Partner", phone: partner.phone, rating: partner.rating, etaMinutes };
}

function getDetailedLineItems(booking: Booking) {
  let items: any[] = [];
  try {
    items = JSON.parse(booking.lineItems || "[]");
  } catch {}

  // Deduplicate by name/key so parts never duplicate between JSON lineItems and BookingProductItem rows
  const existingNames = new Set(
    items.map((i) => (i.value || i.name || "").trim().toLowerCase()),
  );

  if (booking.productItems && booking.productItems.length > 0) {
    for (const pItem of booking.productItems) {
      const p = pItem as any;
      const nameLower = (p.product?.name || "").trim().toLowerCase();
      if (p.status === "APPROVED" && nameLower && !existingNames.has(nameLower)) {
        existingNames.add(nameLower);
        items.push({
          key: `product:${p.productId}:${p.id}`,
          label: "Extra part (approved)",
          value: p.product?.name || "Part",
          qty: p.qty,
          unitPaise: p.unitPricePaise || 0,
          totalPaise: p.totalPaise || 0,
          kind: "product",
        });
      }
    }
  }
  return items;
}

function serializeMarketplaceBooking(booking: Booking, marketplace: boolean) {
  // Status is authoritative from the DB (driven by the partner / dispatch) —
  // never time-simulated.
  const b = booking as any;
  const normalized = normalizeBookingStatus(b.status);
  const paidForMobilization = ["PAID", "COD"].includes(b.paymentStatus);

  return {
    bookingRef: b.bookingRef,
    status: normalized,
    message: getStatusMessage(normalized),
    marketplace,
    service: {
      id: b.service.id,
      name: b.service.name,
      slug: b.service.slug,
      categorySlug: b.service.category.slug,
    },
    issueDescription: b.issueDescription,
    mediaUrls: parseMediaUrls(b.mediaUrls),
    slot: b.slot,
    scheduleType: b.scheduleType,
    address: b.address.fullAddress,
    vendor: b.vendor
      ? {
          id: b.vendor.id,
          name: b.vendor.name,
          phone: b.vendor.phone,
          rating: b.vendor.rating,
        }
      : null,
    provider: serializeProvider(booking),
    // Shown to the customer once a partner is assigned; read aloud to start the job.
    startOtp: paidForMobilization && ["ASSIGNED", "PROVIDER_ARRIVING"].includes(normalized) ? booking.startOtp : null,
    baseChargePaise: booking.baseChargePaise,
    platformFeePaise: booking.platformFeePaise,
    taxPaise: booking.taxPaise,
    durationMinutes: booking.durationMinutes,
    extensionMinutes: booking.extensionMinutes,
    startConfirmedAt: booking.startConfirmedAt,
    quotedAmount: booking.quotedAmount,
    finalAmountPaise: booking.finalAmountPaise ?? booking.quotedAmount,
    lineItems: getDetailedLineItems(booking),
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
  };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Always scope by userId. getBookingByRef matches ANY booking when the userId
  // is omitted, and this payload carries the customer's address and the assigned
  // partner's phone — so an unscoped read would leak PII by ref enumeration.
  let booking = await getBookingByRef(ref, session.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Crew bookings have their own day-wise track — no per-visit status simulation.
  if (isCrewBooking(booking)) {
    if (booking.status === "SEARCHING_CREW") {
      await expireCrewOffers(booking.id);
      booking = (await getBookingByRef(ref, session.id)) ?? booking;
    }
    return NextResponse.json(serializeCrewBooking(booking));
  }

  const marketplace = isMarketplaceBooking(booking);

  if (marketplace) {
    // Direct assignment: reassign only if a partner bailed (SEARCHING_PROVIDER).
    await driveReassignmentIfPending(booking.id);
    booking = (await getBookingByRef(ref, session.id)) ?? booking;
  }

  return NextResponse.json(serializeMarketplaceBooking(booking, marketplace));
}
