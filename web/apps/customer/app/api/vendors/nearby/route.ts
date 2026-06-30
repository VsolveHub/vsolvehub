import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getNearbyVendors, getPreviousVendorsForService } from "@/lib/bookings/vendors";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const addressId = req.nextUrl.searchParams.get("addressId");

  if (!serviceId) {
    return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { category: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  let lat: number | null = null;
  let lng: number | null = null;

  if (addressId) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId: session.id },
    });
    if (address) {
      lat = address.lat;
      lng = address.lng;
    }
  }

  const [nearby, previous] = await Promise.all([
    getNearbyVendors({
      categorySlug: service.category.slug,
      lat,
      lng,
    }),
    getPreviousVendorsForService(session.id, serviceId),
  ]);

  return NextResponse.json({ nearby, previous });
}
