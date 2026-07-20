import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { captureAssignedBookingPayment } from "@vsolve/db";
import { WALLET_BALANCE_PAISE } from "@/lib/profile/section-data";

const paySchema = z.object({
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]),
});

type RouteContext = { params: Promise<{ ref: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = paySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  // Scope by userId: a customer can only pay for their own booking.
  const booking = await prisma.booking.findFirst({
    where: { bookingRef: ref, userId: session.id },
    select: { id: true, quotedAmount: true, paymentStatus: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (parsed.data.paymentMethod === "wallet" && booking.quotedAmount > WALLET_BALANCE_PAISE) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
  }

  // All capture goes through the shared engine: it moves money on the order
  // ledger (and the gateway for card holds) under assertMoneyInvariant, so a
  // booking can never be marked PAID without a matching capture. Idempotent —
  // an already-paid booking returns alreadyPaid without recharging.
  const result = await captureAssignedBookingPayment(booking.id, parsed.data.paymentMethod);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    alreadyPaid: result.alreadyPaid,
    paymentStatus: result.paymentStatus,
    amountPaise: result.amountPaise,
  });
}
