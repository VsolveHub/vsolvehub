import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const paySchema = z.object({ paymentMethod: z.string().min(1).max(40) });

type RouteContext = { params: Promise<{ ref: string }> };

/**
 * Escrow capture. The customer pays the full estimate into escrow once a crew
 * is assigned. The money is held and settled at the end (no-shows refunded,
 * fees withheld) — so there is never a chase-up payment after the work.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = paySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });

  const booking = await prisma.booking.findFirst({ where: { bookingRef: ref, userId: session.id } });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (["ESCROW_HELD", "PAID"].includes(booking.paymentStatus)) {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }
  if (!["CREW_ASSIGNED", "CREW_EN_ROUTE"].includes(booking.status)) {
    return NextResponse.json({ error: "Nothing to pay yet" }, { status: 409 });
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: "ESCROW_HELD", escrowPaise: booking.quotedAmount, paymentMethod: parsed.data.paymentMethod },
  });
  return NextResponse.json({ ok: true, escrowPaise: booking.quotedAmount });
}
