import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { submitBookingReview } from "@/lib/bookings/queries";
import { bookingReviewSchema } from "@/lib/validation/schemas";

type RouteContext = { params: Promise<{ ref: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { ref } = await context.params;
  const body = await req.json();
  const parsed = bookingReviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await submitBookingReview(
    ref,
    session.id,
    parsed.data.rating,
    parsed.data.review ?? ""
  );

  if (!result) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
