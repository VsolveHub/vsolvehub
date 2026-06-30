import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getVehicleBookingByRef } from "@/lib/vehicle/queries";
import { getStatusFlow } from "@/lib/vehicle/constants";

type RouteParams = { params: Promise<{ ref: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { ref } = await params;
  const session = await getServerSession();

  const booking = await getVehicleBookingByRef(ref, session?.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const timeline = getStatusFlow(booking.flowType as any).filter((s) => s !== "CANCELLED");
  const currentIndex = timeline.indexOf(booking.status);
  const nextStatus = currentIndex !== -1 && currentIndex < timeline.length - 1 ? timeline[currentIndex + 1] : null;

  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: booking.status,
    nextStatus,
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { ref } = await params;
  const session = await getServerSession();

  const booking = await getVehicleBookingByRef(ref, session?.id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const newStatus = body.status;
    if (!newStatus) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
    }

    // Update in database
    await prisma.vehicleBooking.update({
      where: { id: booking.id },
      data: { status: newStatus },
    });

    // Create log entry
    await prisma.vehicleBookingStatusLog.create({
      data: {
        bookingId: booking.id,
        status: newStatus,
      },
    });

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
