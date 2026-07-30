import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { calculateServiceCommercials } from "@/lib/bookings/commercials";
import { captureRevisionDelta } from "@vsolve/db";

type RouteContext = { params: Promise<{ ref: string }> };
const schema = z.object({ minutes: z.number().int().min(30).max(120).multipleOf(30) });

export async function POST(req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose 30, 60, 90 or 120 minutes" }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { bookingRef: ref, userId: session.id },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status !== "STARTED" || !booking.startConfirmedAt) {
    return NextResponse.json(
      { error: "Service time can be extended after the start OTP is confirmed" },
      { status: 409 },
    );
  }

  const currentMinutes = booking.durationMinutes + booking.extensionMinutes;
  const hourlyRatePaise = Math.round(
    (booking.baseChargePaise * 60) / Math.max(60, booking.durationMinutes),
  );
  const next = calculateServiceCommercials(
    hourlyRatePaise,
    currentMinutes + parsed.data.minutes,
  );
  const currentCommercialTotal =
    booking.baseChargePaise + booking.platformFeePaise + booking.taxPaise;
  const deltaPaise = Math.max(0, next.totalPaise - currentCommercialTotal);

  const charged = await captureRevisionDelta(booking.id, deltaPaise);
  if (!charged.ok) return NextResponse.json({ error: charged.error }, { status: 402 });

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      extensionMinutes: { increment: parsed.data.minutes },
      baseChargePaise: next.serviceSubtotalPaise,
      platformFeePaise: next.platformFeePaise,
      taxPaise: next.platformFeeGstPaise,
      quotedAmount: { increment: deltaPaise },
      finalAmountPaise: { increment: deltaPaise },
    },
  });

  return NextResponse.json({
    ok: true,
    extensionMinutes: updated.extensionMinutes,
    totalDurationMinutes: updated.durationMinutes + updated.extensionMinutes,
    deltaPaise,
    finalAmountPaise: updated.finalAmountPaise,
  });
}
