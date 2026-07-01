import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
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

  const booking = await prisma.booking.findFirst({
    where: { bookingRef: ref, userId: session.id },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (["PAID", "COD"].includes(booking.paymentStatus)) {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  if (!booking.assignedPartnerId || !["ASSIGNED", "PROVIDER_ARRIVING"].includes(booking.status)) {
    return NextResponse.json({ error: "Payment opens after a partner accepts your request" }, { status: 409 });
  }

  if (parsed.data.paymentMethod === "wallet" && booking.quotedAmount > WALLET_BALANCE_PAISE) {
    return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
  }

  const paymentStatus = parsed.data.paymentMethod === "cod" ? "COD" : "PAID";
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      paymentStatus,
      paymentMethod: parsed.data.paymentMethod,
      finalAmountPaise: booking.finalAmountPaise ?? booking.quotedAmount,
    },
  });

  return NextResponse.json({
    ok: true,
    paymentStatus,
    amountPaise: booking.quotedAmount,
  });
}
