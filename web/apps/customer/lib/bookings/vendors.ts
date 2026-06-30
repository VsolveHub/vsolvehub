import "server-only";

import { prisma } from "@/lib/db/client";
import type { VendorOption } from "./types";

export { pickBestVendor } from "./vendor-pick";

const HYDERABAD_LAT = 17.4435;
const HYDERABAD_LNG = 78.3772;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toVendorOption(
  vendor: {
    id: string;
    name: string;
    phone: string;
    rating: number;
    lat: number;
    lng: number;
  },
  customerLat: number,
  customerLng: number,
  isPrevious = false
): VendorOption {
  return {
    id: vendor.id,
    name: vendor.name,
    phone: vendor.phone,
    rating: vendor.rating,
    distanceKm: Math.round(haversineKm(customerLat, customerLng, vendor.lat, vendor.lng) * 10) / 10,
    isPrevious,
  };
}

export async function getNearbyVendors(input: {
  categorySlug: string;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
}): Promise<VendorOption[]> {
  const customerLat = input.lat ?? HYDERABAD_LAT;
  const customerLng = input.lng ?? HYDERABAD_LNG;

  const vendors = await prisma.vendor.findMany({
    where: {
      isAvailable: true,
      OR: [{ categorySlug: input.categorySlug }, { categorySlug: "all" }],
    },
  });

  return vendors
    .map((v) => toVendorOption(v, customerLat, customerLng))
    .sort((a, b) => a.distanceKm - b.distanceKm || b.rating - a.rating)
    .slice(0, input.limit ?? 8);
}

export async function getPreviousVendorsForService(userId: string, serviceId: string) {
  const bookings = await prisma.booking.findMany({
    where: {
      userId,
      serviceId,
      vendorId: { not: null },
      status: "COMPLETED",
    },
    include: { vendor: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const seen = new Set<string>();
  const previous: VendorOption[] = [];

  for (const booking of bookings) {
    if (!booking.vendor || seen.has(booking.vendor.id)) continue;
    seen.add(booking.vendor.id);
    previous.push(
      toVendorOption(booking.vendor, HYDERABAD_LAT, HYDERABAD_LNG, true)
    );
  }

  return previous;
}

export async function getVendorById(vendorId: string) {
  return prisma.vendor.findUnique({ where: { id: vendorId } });
}
