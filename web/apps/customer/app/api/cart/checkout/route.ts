import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { checkoutCart } from "@/lib/cart/checkout";

const schema = z.object({ paymentMethod: z.enum(["upi", "card", "wallet", "cod"]) });

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });

  const result = await checkoutCart(session.id, parsed.data.paymentMethod);
  if (!result.ok) {
    const status = result.error === "Your cart is empty" ? 409 : 402;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
