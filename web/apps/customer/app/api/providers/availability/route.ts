import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { findAvailablePartners } from "@/lib/fulfillment/matching";
import { suggestSlots } from "@/lib/fulfillment/slot-suggestions";
import { toPublicProfiles } from "@/lib/fulfillment/profiles";

// Hyderabad centre — used when an address has no geocode (matches the booking
// route), so a missing pin never silently excludes the whole city.
const DEFAULT_LAT = 17.385;
const DEFAULT_LNG = 78.4867;
/** How many professionals the choose step offers before "auto-assign". */
const MAX_CHOICES = 4;

/**
 * GET /api/providers/availability?serviceId=&addressId=&slot=&scheduleType=
 *
 * The pre-payment gate: how many professionals can take this exact slot. Returns
 * COUNTS ONLY — no partner identity or PII; the assigned professional is revealed
 * only after payment, on the booking. A zero count also carries suggested
 * alternative slots so the UI can offer them without a second round-trip.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const serviceId = params.get("serviceId");
  const addressId = params.get("addressId");
  const slot = params.get("slot");
  const scheduleType: "instant" | "scheduled" =
    params.get("scheduleType") === "instant" ? "instant" : "scheduled";
  if (!serviceId || !addressId || !slot) {
    return NextResponse.json({ error: "serviceId, addressId and slot are required" }, { status: 400 });
  }

  const [service, address] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId }, include: { subCategory: true } }),
    prisma.address.findFirst({ where: { id: addressId, userId: session.id }, select: { lat: true, lng: true } }),
  ]);
  if (!service || !address) {
    return NextResponse.json({ error: "Service or address not found" }, { status: 404 });
  }

  const ctx = {
    addrLat: address.lat ?? DEFAULT_LAT,
    addrLng: address.lng ?? DEFAULT_LNG,
    slot,
    scheduleType,
    service,
  };
  const { ranked, pool } = await findAvailablePartners({
    service,
    addrLat: ctx.addrLat,
    addrLng: ctx.addrLng,
    slot,
    scheduleType,
  });

  // The choose-your-professional list: top few real, assignable pros as
  // profiles. Cap before enriching, then one scoped query for the PII the
  // matcher deliberately omits — display always equals who can be assigned.
  const top = ranked.slice(0, MAX_CHOICES);
  const identityRows = top.length
    ? await prisma.partner.findMany({
        where: { id: { in: top.map((p) => p.id) } },
        select: { id: true, fullName: true, jobsCompleted: true },
      })
    : [];
  const identities = new Map(
    identityRows.map((r) => [r.id, { name: r.fullName ?? "V Solve Professional", jobsCompleted: r.jobsCompleted }]),
  );

  return NextResponse.json({
    count: ranked.length,
    professionals: toPublicProfiles(top, { addrLat: ctx.addrLat, addrLng: ctx.addrLng }, identities),
    suggestedSlots: ranked.length === 0 ? suggestSlots(pool, ctx) : [],
  });
}
