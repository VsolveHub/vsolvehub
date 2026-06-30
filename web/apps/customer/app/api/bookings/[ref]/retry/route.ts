import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getBookingByRef, isMarketplaceBooking } from "@/lib/bookings/queries";
import { retryBookingDispatch } from "@/lib/fulfillment/push-dispatch";

type RouteContext = { params: Promise<{ ref: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const booking = await getBookingByRef(ref, session.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (!isMarketplaceBooking(booking)) {
    return NextResponse.json({ error: "Retry not available for this booking" }, { status: 400 });
  }

  const result = await retryBookingDispatch(booking.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const refreshed = await getBookingByRef(ref, session.id);
  return NextResponse.json({
    ok: true,
    bookingRef: ref,
    status: refreshed?.status ?? "PENDING",
    offersCreated: result.offersCreated ?? 0,
  });
}
