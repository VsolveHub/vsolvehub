import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { checkoutStoreCart } from "@/lib/store/cart";

const schema = z.object({
  addressId: z.string().min(1),
  paymentMethod: z.enum(["upi", "card", "wallet", "cod"]),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await checkoutStoreCart(session.id, parsed.data.addressId, parsed.data.paymentMethod);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, orderRef: result.orderRef });
}
