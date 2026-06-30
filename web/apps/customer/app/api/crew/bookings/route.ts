import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { createCrewBookingAuto, createCrewBookingDirect } from "@/lib/crew/queries";
import { tradeSlugForService } from "@/lib/crew/constants";
import { crewBookingSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = crewBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const [service, address] = await Promise.all([
    prisma.service.findUnique({ where: { id: data.serviceId }, include: { category: true } }),
    prisma.address.findFirst({ where: { id: data.addressId, userId: session.id } }),
  ]);
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  if (!address) return NextResponse.json({ error: "Please add a service address first" }, { status: 404 });

  const tradeSlug = data.tradeSlug ?? tradeSlugForService(service.name, service.category.slug);
  const common = {
    userId: session.id,
    serviceId: data.serviceId,
    addressId: data.addressId,
    startDate: data.startDate,
    durationDays: data.durationDays,
    roles: data.roles,
    issueDescription: data.issueDescription ?? "Team requirement",
    mediaUrls: data.mediaUrls ?? [],
    siteLocation: data.siteLocation ?? address.fullAddress,
    tradeSlug,
  };

  if (data.assignmentMode === "auto") {
    const booking = await createCrewBookingAuto(common);
    return NextResponse.json({
      bookingRef: booking.bookingRef,
      status: booking.status,
      assignmentMode: "auto",
    });
  }

  const booking = await createCrewBookingDirect({ ...common, crewId: data.crewId! });
  if (!booking) {
    return NextResponse.json({ error: "This crew is no longer available" }, { status: 409 });
  }
  return NextResponse.json({
    bookingRef: booking.bookingRef,
    status: booking.status,
    assignmentMode: "quotes",
    crew: { id: booking.crew!.id, name: booking.crew!.name },
    quotedAmount: booking.quotedAmount,
  });
}
