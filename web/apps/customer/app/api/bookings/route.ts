import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createBooking } from "@/lib/bookings/queries";
import { getAllUserBookings } from "@/lib/bookings/user-bookings";
import { bookingSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/db/client";
import { resolveServiceArchetype, usesPushDispatch } from "@/lib/bookings/archetype";
import { dispatchBookingOffers, dispatchDirectOffer } from "@/lib/fulfillment/push-dispatch";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    serviceId,
    addressId,
    slot,
    partnerId,
    issueDescription,
    mediaUrls,
    scheduleType,
    archetypeDetails,
  } = parsed.data;

  const [service, address] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId }, include: { category: true } }),
    prisma.address.findFirst({ where: { id: addressId, userId: session.id } }),
  ]);

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  if (!address) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  const archetype = resolveServiceArchetype(service.archetype);
  if (!usesPushDispatch(archetype)) {
    return NextResponse.json({ error: "This service is not bookable here" }, { status: 400 });
  }

  const quotedAmount = service.pricePaise;

  // Single-provider dispatch: the customer pays *after* a partner accepts, so the
  // booking is created PENDING with no upfront payment on either path.
  const booking = await createBooking({
    userId: session.id,
    serviceId,
    addressId,
    slot,
    quotedAmount,
    baseChargePaise: service.pricePaise,
    archetype,
    issueDescription,
    mediaUrls,
    paymentStatus: "PENDING",
    paymentMethod: null,
    scheduleType,
    vendorAssignmentMode: partnerId ? "manual" : "auto",
    archetypeDetails: archetypeDetails ?? {},
  });

  // Direct offer to the hand-picked partner, else broadcast to the matched pool.
  // A failed direct offer (partner went offline) falls back to auto-dispatch so
  // the booking is never stranded.
  let assignmentMode: "direct" | "auto" = "auto";
  if (partnerId) {
    const direct = await dispatchDirectOffer(booking.id, partnerId);
    if (direct.ok) {
      assignmentMode = "direct";
    } else {
      await dispatchBookingOffers(booking.id);
    }
  } else {
    await dispatchBookingOffers(booking.id);
  }

  const refreshed = await prisma.booking.findUnique({ where: { id: booking.id } });

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: refreshed?.status ?? booking.status,
    paymentStatus: booking.paymentStatus,
    service: booking.service.name,
    slot: booking.slot,
    address: booking.address.fullAddress,
    quotedAmount: booking.quotedAmount,
    assignmentMode,
    marketplace: true,
  });
}

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const bookings = await getAllUserBookings(session.id);
  return NextResponse.json({ bookings });
}
