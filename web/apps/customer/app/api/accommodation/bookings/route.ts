import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createAccommodationBooking, getPropertyById } from "@/lib/accommodation/queries";
import { computeAccommodationPayment } from "@/lib/accommodation/pricing";
import { accommodationBookingSchema } from "@/lib/validation/schemas";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = accommodationBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const property = await getPropertyById(data.propertyId);
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  if (data.bookingType === "move_in" && !data.moveInDate) {
    return NextResponse.json({ error: "Move-in date is required" }, { status: 400 });
  }
  if (data.bookingType === "visit" && !data.visitDate) {
    return NextResponse.json({ error: "Visit date is required" }, { status: 400 });
  }

  const payment = computeAccommodationPayment(
    property.pricePaise,
    data.includeFirstMonthRent ?? false
  );

  if (data.paymentMethod === "wallet" && payment.totalPaidPaise > WALLET_BALANCE_PAISE) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
  }

  const booking = await createAccommodationBooking({
    userId: session.id,
    propertyId: data.propertyId,
    bookingType: data.bookingType,
    moveInDate: data.moveInDate,
    visitDate: data.visitDate,
    durationMonths: data.durationMonths,
    numberOfPeople: data.numberOfPeople,
    occupation: data.occupation,
    specialRequirements: data.specialRequirements ?? "",
    idProofUrls: data.idProofUrls ?? [],
    ...payment,
    paymentStatus: data.paymentMethod === "cod" ? "COD" : "PAID",
    paymentMethod: data.paymentMethod,
  });

  if (!booking) {
    return NextResponse.json({ error: "Could not create booking" }, { status: 500 });
  }

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: booking.status,
    totalPaidPaise: booking.totalPaidPaise,
    property: { title: booking.property.title },
  });
}
