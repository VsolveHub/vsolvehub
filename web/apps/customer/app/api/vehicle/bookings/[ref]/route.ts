import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
  getVehicleBookingByRef,
  serializeVehicleBooking,
  syncVehicleBookingStatus,
} from "@/lib/vehicle/queries";
import type { VehicleFlowType } from "@/lib/vehicle/constants";

type RouteParams = { params: Promise<{ ref: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { ref } = await params;
  const session = await getServerSession();
  const booking = await getVehicleBookingByRef(ref, session?.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const status = await syncVehicleBookingStatus(
    booking.id,
    booking.createdAt,
    booking.status,
    booking.flowType as VehicleFlowType
  );

  const updated = status !== booking.status ? await getVehicleBookingByRef(ref, session?.id) : booking;
  if (!updated) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json(serializeVehicleBooking(updated));
}
