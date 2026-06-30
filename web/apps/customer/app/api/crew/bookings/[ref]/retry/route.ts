import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { retryCrewBooking } from "@/lib/crew/queries";
import { tradeSlugForService } from "@/lib/crew/constants";

type RouteContext = { params: Promise<{ ref: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  const { ref } = await context.params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const booking = await prisma.booking.findFirst({
    where: { bookingRef: ref, userId: session.id },
    include: { service: { include: { category: true } } },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const tradeSlug = tradeSlugForService(booking.service.name, booking.service.category.slug);
  const result = await retryCrewBooking(ref, session.id, tradeSlug);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, status: "SEARCHING_CREW" });
}
