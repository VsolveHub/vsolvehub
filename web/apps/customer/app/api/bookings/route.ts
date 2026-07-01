import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createBooking } from "@/lib/bookings/queries";
import { getAllUserBookings } from "@/lib/bookings/user-bookings";
import { getVendorById } from "@/lib/bookings/vendors";
import { bookingSchema } from "@/lib/validation/schemas";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";
import { prisma } from "@/lib/db/client";
import { resolveServiceArchetype, usesPushDispatch } from "@/lib/bookings/archetype";
import { dispatchBookingOffers } from "@/lib/fulfillment/push-dispatch";

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
    vendorId,
    issueDescription,
    mediaUrls,
    scheduleType,
    paymentMethod,
    vendorAssignmentMode,
    bookingType,
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
  const assignmentMode = vendorAssignmentMode ?? "auto";
  const isAutoDispatch = usesPushDispatch(archetype) && assignmentMode === "auto" && !vendorId;

  let vendor = null;
  if (!isAutoDispatch) {
    if (!vendorId) {
      return NextResponse.json({ error: "Professional is required" }, { status: 400 });
    }
    vendor = await getVendorById(vendorId);
    if (!vendor) {
      return NextResponse.json({ error: "Professional not found" }, { status: 404 });
    }
  }

  const finalBookingType = bookingType || archetypeDetails?.bookingType || "individual";

  let baseChargePaise = service.pricePaise;
  if (finalBookingType === "team") {
    baseChargePaise = 1860000; // ₹18,600 * 100 paise
  }
  const quotedAmount = baseChargePaise;

  if (!isAutoDispatch && !paymentMethod) {
    return NextResponse.json({ error: "Payment method is required" }, { status: 400 });
  }

  if (!isAutoDispatch && paymentMethod === "wallet" && quotedAmount > WALLET_BALANCE_PAISE) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
  }

  const paymentStatus = isAutoDispatch ? "PENDING" : paymentMethod === "cod" ? "COD" : "PAID";

  const booking = await createBooking({
    userId: session.id,
    serviceId,
    addressId,
    slot,
    quotedAmount,
    baseChargePaise,
    archetype,
    vendorId: isAutoDispatch ? undefined : vendorId,
    issueDescription,
    mediaUrls,
    paymentStatus,
    paymentMethod: isAutoDispatch ? null : paymentMethod,
    scheduleType,
    vendorAssignmentMode: assignmentMode,
    archetypeDetails: {
      ...archetypeDetails,
      bookingType: finalBookingType,
    },
  });

  if (isAutoDispatch) {
    await dispatchBookingOffers(booking.id);
    const refreshed = await prisma.booking.findUnique({ where: { id: booking.id } });
    if (refreshed) {
      booking.status = refreshed.status;
    }
  }

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    service: booking.service.name,
    slot: booking.slot,
    address: booking.address.fullAddress,
    vendor: booking.vendor
      ? { name: booking.vendor.name, rating: booking.vendor.rating }
      : null,
    baseChargePaise: booking.baseChargePaise,
    quotedAmount: booking.quotedAmount,
    marketplace: isAutoDispatch,
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
