import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createBooking } from "@/lib/bookings/queries";
import { getAllUserBookings } from "@/lib/bookings/user-bookings";
import { bookingSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/db/client";
import { resolveServiceArchetype, usesPushDispatch } from "@/lib/bookings/archetype";
import { dispatchBookingOffers } from "@/lib/fulfillment/push-dispatch";
import { coerceSelections, priceBooking } from "@/lib/catalog/price-service";
import { authorizeOrder } from "@/lib/orders/authorize";

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
    issueDescription,
    mediaUrls,
    scheduleType,
    archetypeDetails,
    selections,
    paymentMethod,
  } = parsed.data;

  const [service, address] = await Promise.all([
    prisma.service.findUnique({
      where: { id: serviceId },
      include: { category: true, subCategory: true },
    }),
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

  // Reject scheduled bookings placed in the past (allow a 15-min clock-skew grace).
  if (scheduleType === "scheduled" && new Date(slot).getTime() < Date.now() - 15 * 60 * 1000) {
    return NextResponse.json({ error: "Please choose a future time slot" }, { status: 400 });
  }

  // Recompute the price from the raw selections. `service.pricePaise` is only the
  // advertised "starts at" figure and is used as a floor when a service has no
  // priced requirements configured.
  const estimate = priceBooking({
    categorySlug: service.category.slug,
    subCategorySlug: service.subCategory?.slug,
    serviceSlug: service.slug,
    selections: coerceSelections(selections ?? archetypeDetails?.fieldValues),
  });
  const quotedAmount = estimate.totalPaise > 0 ? estimate.totalPaise : service.pricePaise;

  // Created DRAFT so it is invisible to lists and undispatchable until money is
  // authorized. authorizeOrder moves it to AUTHORIZED.
  const booking = await createBooking({
    userId: session.id,
    serviceId,
    addressId,
    slot,
    quotedAmount,
    baseChargePaise: estimate.basePaise > 0 ? estimate.basePaise : service.pricePaise,
    lineItems: estimate.lineItems,
    archetype,
    issueDescription,
    mediaUrls,
    status: "DRAFT",
    paymentStatus: "PENDING",
    paymentMethod: null,
    scheduleType,
    vendorAssignmentMode: "auto",
    archetypeDetails: archetypeDetails ?? {},
  });

  const authorized = await authorizeOrder({
    userId: session.id,
    bookingIds: [booking.id],
    amountPaise: quotedAmount,
    method: paymentMethod ?? "upi",
    // Scoped to this booking, so a retry of the same submit is idempotent while
    // a genuinely new booking always gets its own order.
    idempotencyKey: `booking:${booking.id}`,
  });

  if (!authorized.ok) {
    // The booking stays DRAFT: nothing dispatches and no provider is disturbed.
    return NextResponse.json({ error: authorized.error }, { status: 402 });
  }

  // Fan out to every eligible provider in range; first to accept is assigned.
  await dispatchBookingOffers(booking.id);

  const refreshed = await prisma.booking.findUnique({ where: { id: booking.id } });

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    orderRef: authorized.orderRef,
    status: refreshed?.status ?? booking.status,
    paymentStatus: refreshed?.paymentStatus ?? booking.paymentStatus,
    service: booking.service.name,
    slot: booking.slot,
    address: booking.address.fullAddress,
    quotedAmount: booking.quotedAmount,
    assignmentMode: "auto" as const,
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
