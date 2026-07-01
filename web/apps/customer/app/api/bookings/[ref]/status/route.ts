import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  getBookingByRef,
  getSimulatedStatus,
  getStatusMessage,
  isMarketplaceBooking,
  syncBookingStatus,
} from "@/lib/bookings/queries";
import { BOOKING_STATUSES, MARKETPLACE_TIMELINE, normalizeBookingStatus } from "@/lib/constants";
import { processExpiredOffersAndRedispatch } from "@/lib/fulfillment/push-dispatch";
import { usesPushDispatch } from "@/lib/bookings/archetype";
import { isCrewBooking } from "@/lib/crew/queries";
import { CREW_STATUS_MESSAGES } from "@/lib/crew/constants";

type RouteContext = { params: Promise<{ ref: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();

  let booking = await getBookingByRef(ref, session?.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Crew bookings advance via lead actions, not the simulated timeline.
  if (isCrewBooking(booking)) {
    return NextResponse.json({
      bookingRef: booking.bookingRef,
      status: booking.status,
      message: CREW_STATUS_MESSAGES[booking.status] ?? "Tracking your crew booking.",
      isCrew: true,
    });
  }

  const marketplace = isMarketplaceBooking(booking);
  let status: string;

  if (marketplace) {
    await processExpiredOffersAndRedispatch(booking.id);
    booking = (await getBookingByRef(ref, session?.id)) ?? booking;
    status = booking.status;
  } else {
    status = await syncBookingStatus(booking.id, booking.createdAt, booking.status);
  }

  const normalized = normalizeBookingStatus(status);
  const isPushDispatch = usesPushDispatch(booking.archetype);
  const timeline: string[] = (marketplace || isPushDispatch)
    ? [...MARKETPLACE_TIMELINE]
    : [...BOOKING_STATUSES.filter((s) => s !== "CANCELLED")];

  let currentIndex = timeline.indexOf(normalized);
  if (normalized === "NO_WORKER_FOUND") {
    currentIndex = timeline.indexOf("SEARCHING_PROVIDER");
  }

  const nextStatus = currentIndex !== -1 && currentIndex < timeline.length - 1 ? timeline[currentIndex + 1] : null;

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: normalized,
    message: getStatusMessage(normalized),
    nextStatus,
    marketplace,
    simulatedAt: new Date().toISOString(),
    progress: {
      current: currentIndex + 1,
      total: timeline.length,
    },
  });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();

  const booking = await getBookingByRef(ref, session?.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  let status: string;
  try {
    const body = await req.json();
    if (body.status) {
      status = body.status;
      
      // Real status is driven by the partner via the shared fulfillment engine;
      // no demo-provider assignment or fabricated revised quotes here.
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status },
      });
      await prisma.bookingStatusLog.create({
        data: { bookingId: booking.id, status },
      });
    } else {
      status = isMarketplaceBooking(booking)
        ? booking.status
        : await syncBookingStatus(booking.id, booking.createdAt, booking.status);
    }
  } catch {
    status = isMarketplaceBooking(booking)
      ? booking.status
      : await syncBookingStatus(booking.id, booking.createdAt, booking.status);
  }

  const normalized = normalizeBookingStatus(status);

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: normalized,
    message: getStatusMessage(normalized),
  });
}
