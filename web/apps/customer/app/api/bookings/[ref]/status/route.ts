import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";

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
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Always scope by userId — getBookingByRef matches ANY booking when the userId
  // is omitted, and the payload carries the customer's address and phone.
  let booking = await getBookingByRef(ref, session.id);
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
    booking = (await getBookingByRef(ref, session.id)) ?? booking;
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

/**
 * Refresh a booking's status.
 *
 * This endpoint deliberately does NOT accept a status from the caller. Job state
 * is driven exclusively by the partner through the shared fulfillment engine
 * (accept → en route → start via OTP → complete). Honouring a client-supplied
 * status would let a customer mark their own job ASSIGNED or COMPLETED.
 */
export async function POST(_req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Scoped to the caller: without a userId, getBookingByRef matches any booking.
  const booking = await getBookingByRef(ref, session.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const status = isMarketplaceBooking(booking)
    ? booking.status
    : await syncBookingStatus(booking.id, booking.createdAt, booking.status);

  const normalized = normalizeBookingStatus(status);

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: normalized,
    message: getStatusMessage(normalized),
  });
}
