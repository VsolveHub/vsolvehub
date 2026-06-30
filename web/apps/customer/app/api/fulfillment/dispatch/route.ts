import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { dispatchBookingOffers } from "@/lib/fulfillment/dispatch";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { bookingId: string };
  if (!body.bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });

  try {
    const result = await dispatchBookingOffers(body.bookingId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
