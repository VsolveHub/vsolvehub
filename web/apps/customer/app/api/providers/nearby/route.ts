import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getNearbyProviders } from "@/lib/provider/nearby";

/**
 * GET /api/providers/nearby?serviceId=&addressId=
 * Real online partners the customer can hand-pick for this service. Replaces the
 * old fake-Vendor `/api/vendors/nearby`.
 */
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

  let lat: number | null = null;
  let lng: number | null = null;
  if (addressId) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId: session.id },
      select: { lat: true, lng: true },
    });
    if (address) {
      lat = address.lat;
      lng = address.lng;
    }
  }

  const providers = await getNearbyProviders({ serviceId, lat, lng });
  return NextResponse.json({ providers });
}
