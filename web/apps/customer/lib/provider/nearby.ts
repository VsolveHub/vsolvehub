import "server-only";

import { prisma } from "@/lib/db/client";
import { partnerMatchesService, partnerMatchInclude } from "@/lib/provider/matching";

const HYDERABAD_LAT = 17.4435;
const HYDERABAD_LNG = 78.3772;
/** Rough on-road speed used to turn distance into a friendly ETA. */
const AVG_KMPH = 22;
const SERVICE_RADIUS_KM = 25;

export type NearbyProvider = {
  id: string;
  name: string;
  rating: number;
  jobsCompleted: number;
  distanceKm: number;
  etaMins: number;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Real, online partners matching a service — ACTIVE + online, trade/skill
 * matched, sorted by distance then rating.
 *
 * Read-only social proof ("12 professionals available near you"). Customers do
 * not choose a provider: jobs fan out to the whole eligible pool after payment
 * and the first to accept is assigned.
 */
export async function getNearbyProviders(input: {
  serviceId: string;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
}): Promise<NearbyProvider[]> {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    include: { subCategory: { select: { slug: true } } },
  });
  if (!service) return [];

  const custLat = input.lat ?? HYDERABAD_LAT;
  const custLng = input.lng ?? HYDERABAD_LNG;

  const partners = await prisma.partner.findMany({
    where: { providerType: "CAPTAIN", status: "ACTIVE", isOnline: true },
    include: partnerMatchInclude,
    take: 50,
  });

  return partners
    .filter((p) => partnerMatchesService(p, service))
    .map((p) => {
      const distanceKm =
        p.lat != null && p.lng != null
          ? Math.round(haversineKm(custLat, custLng, p.lat, p.lng) * 10) / 10
          : 0;
      return {
        id: p.id,
        name: p.fullName ?? "V Solve Professional",
        rating: p.rating,
        jobsCompleted: p.jobsCompleted,
        distanceKm,
        etaMins: Math.max(10, Math.round((distanceKm / AVG_KMPH) * 60) + 10),
      };
    })
    .filter((p) => p.distanceKm <= SERVICE_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm || b.rating - a.rating)
    .slice(0, input.limit ?? 8);
}
