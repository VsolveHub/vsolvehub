import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
  getAccommodationBookingByRef,
  getAccommodationStatusMessage,
  syncAccommodationBookingStatus,
} from "@/lib/accommodation/queries";
import { ACCOMMODATION_STATUSES } from "@/lib/accommodation/constants";

type RouteContext = { params: Promise<{ ref: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();

  const booking = await getAccommodationBookingByRef(ref, session?.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const status = await syncAccommodationBookingStatus(
    booking.id,
    booking.createdAt,
    booking.status,
    booking.bookingType
  );

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status,
    message: getAccommodationStatusMessage(status),
    bookingType: booking.bookingType,
    moveInDate: booking.moveInDate,
    visitDate: booking.visitDate,
    durationMonths: booking.durationMonths,
    numberOfPeople: booking.numberOfPeople,
    occupation: booking.occupation,
    specialRequirements: booking.specialRequirements,
    tokenAdvancePaise: booking.tokenAdvancePaise,
    bookingFeePaise: booking.bookingFeePaise,
    firstMonthRentPaise: booking.firstMonthRentPaise,
    totalPaidPaise: booking.totalPaidPaise,
    paymentStatus: booking.paymentStatus,
    paymentMethod: booking.paymentMethod,
    property: {
      id: booking.property.id,
      title: booking.property.title,
      location: booking.property.location,
      images: JSON.parse(booking.property.images || "[]") as string[],
    },
    owner: {
      id: booking.owner.id,
      name: booking.owner.name,
      phone: booking.owner.phone,
      rating: booking.owner.rating,
    },
    statusLogs: booking.statusLogs,
    statuses: ACCOMMODATION_STATUSES.filter((s) => s !== "CANCELLED"),
  });
}
