import "server-only";
import { prisma } from "@vsolve/db";
import { defaultRoleRatePaise } from "./crew-constants";
import { crewCanTakeBooking } from "./crew-capacity";

/**
 * Crew broadcast offers (Auto Assign). First crew to accept wins; acceptance
 * prices the booking from the accepting crew's rate card and seeds job-days.
 */

function addDaysISO(startISO: string, days: number): string {
  const d = new Date(startISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function genOtp(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function parseDetails(raw: string): { roles?: { roleId: string; count: number }[]; startDate?: string } {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Pending, non-expired requests offered to this partner's crew. */
export async function listPendingRequests(partnerId: string) {
  const crew = await prisma.crew.findUnique({ where: { leadPartnerId: partnerId }, select: { id: true } });
  if (!crew) return [];
  const offers = await prisma.crewJobOffer.findMany({
    where: { crewId: crew.id, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { offeredAt: "desc" },
    include: {
      booking: {
        include: { service: { select: { name: true } }, address: { select: { area: true, city: true, fullAddress: true } } },
      },
    },
  });
  return offers.map((o) => {
    const details = parseDetails(o.booking.archetypeDetails);
    return {
      offerId: o.id,
      service: o.booking.service.name,
      location: o.booking.address.area || o.booking.address.city || o.booking.address.fullAddress,
      durationDays: o.booking.durationDays,
      startDate: details.startDate ?? null,
      roles: (details.roles ?? []).filter((r) => r.count > 0),
      expiresAt: o.expiresAt.toISOString(),
    };
  });
}

/** Accept a broadcast offer — first to accept wins; booking priced by this crew's rate card. */
export async function acceptOffer(partnerId: string, offerId: string): Promise<{ ok: boolean; error?: string }> {
  const offer = await prisma.crewJobOffer.findUnique({
    where: { id: offerId },
    include: { crew: { select: { id: true, leadPartnerId: true } }, booking: true },
  });
  if (!offer || offer.crew.leadPartnerId !== partnerId) return { ok: false, error: "Request not found" };
  if (offer.status !== "PENDING" || offer.expiresAt < new Date()) return { ok: false, error: "This request expired" };

  const booking = offer.booking;
  if (booking.crewId || booking.status !== "SEARCHING_CREW") return { ok: false, error: "Job already taken" };

  // Re-check capacity at accept time (the crew may have filled up since the offer).
  if (!(await crewCanTakeBooking(offer.crew.id, booking.id))) {
    return { ok: false, error: "Your crew is already fully booked on those dates." };
  }

  const details = parseDetails(booking.archetypeDetails);
  const roles = details.roles ?? [];
  const days = Math.max(1, booking.durationDays);
  const startISO = details.startDate ?? new Date().toISOString().slice(0, 10);

  const rates = await prisma.crewRoleRate.findMany({ where: { crewId: offer.crew.id } });
  const rateFor = (role: string) => rates.find((r) => r.role === role)?.dayRatePaise ?? defaultRoleRatePaise(role);
  const total = roles.reduce((s, r) => s + Math.max(0, r.count) * rateFor(r.roleId), 0) * days;

  await prisma.$transaction([
    prisma.crewJobOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", respondedAt: new Date() } }),
    prisma.crewJobOffer.updateMany({
      where: { bookingId: booking.id, id: { not: offer.id }, status: "PENDING" },
      data: { status: "EXPIRED", respondedAt: new Date() },
    }),
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        crewId: offer.crew.id,
        status: "CREW_ASSIGNED",
        quotedAmount: total,
        baseChargePaise: Math.round(total / days),
        startOtp: genOtp(),
        endOtp: genOtp(),
      },
    }),
    prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "CREW_ASSIGNED" } }),
  ]);

  await prisma.crewJobDay.createMany({
    data: Array.from({ length: days }, (_, i) => ({ bookingId: booking.id, dayDate: addDaysISO(startISO, i) })),
  });
  return { ok: true };
}

export async function declineOffer(partnerId: string, offerId: string): Promise<{ ok: boolean; error?: string }> {
  const offer = await prisma.crewJobOffer.findUnique({
    where: { id: offerId },
    include: { crew: { select: { leadPartnerId: true } } },
  });
  if (!offer || offer.crew.leadPartnerId !== partnerId || offer.status !== "PENDING") return { ok: false };
  await prisma.crewJobOffer.update({ where: { id: offer.id }, data: { status: "DECLINED", respondedAt: new Date() } });
  return { ok: true };
}
