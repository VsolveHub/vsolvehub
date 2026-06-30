import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { cancelVehicleBooking } from "@/lib/vehicle/queries";

type RouteParams = { params: Promise<{ ref: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { ref } = await params;
  const result = await cancelVehicleBooking(ref, session.id);
  if (!result) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
