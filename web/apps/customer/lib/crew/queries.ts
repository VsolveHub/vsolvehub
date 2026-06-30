import { prisma } from "@/lib/db/client";
import { generateBookingRef } from "@/lib/format";
import { roleRatePaise } from "./constants";
import type { CrewRoleRequest } from "./pricing";

/** Seconds a broadcast offer stays open before it expires. */
export const CREW_OFFER_TTL_SECONDS = 600;

export type CrewQuote = {
  crewId: string;
  name: string;
  rating: number;
  reviewCount: number;
  city: string;
  equipment: string[];
  memberCount: number;
  covers: boolean;
  dailyRatePaise: number;
  totalPaise: number;
};

function parseEquipment(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Per-role day rate for a crew: its own published rate, else the platform default. */
function rateForRole(rates: { role: string; dayRatePaise: number }[], role: string): number {
  return rates.find((r) => r.role === role)?.dayRatePaise ?? roleRatePaise(role);
}

function dailyRateFromRates(
  rates: { role: string; dayRatePaise: number }[],
  roles: CrewRoleRequest[],
): number {
  return roles.reduce((sum, r) => sum + Math.max(0, r.count) * rateForRole(rates, r.roleId), 0);
}

type CrewWithRoster = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  city: string;
  equipment: string;
  members: { role: string }[];
  roleRates: { role: string; dayRatePaise: number }[];
};

function toQuote(crew: CrewWithRoster, roles: CrewRoleRequest[], days: number): CrewQuote {
  const byRole = new Map<string, number>();
  for (const m of crew.members) byRole.set(m.role, (byRole.get(m.role) ?? 0) + 1);
  const wanted = roles.filter((r) => r.count > 0);
  const covers = wanted.every((r) => (byRole.get(r.roleId) ?? 0) >= r.count);
  const dailyRatePaise = dailyRateFromRates(crew.roleRates, wanted);
  return {
    crewId: crew.id,
    name: crew.name,
    rating: crew.rating,
    reviewCount: crew.reviewCount,
    city: crew.city,
    equipment: parseEquipment(crew.equipment),
    memberCount: crew.members.length,
    covers,
    dailyRatePaise,
    totalPaise: dailyRatePaise * Math.max(1, days),
  };
}

async function activeCrews(tradeSlug?: string) {
  let crews = await prisma.crew.findMany({
    where: { status: "ACTIVE", ...(tradeSlug ? { tradeSlug } : {}) },
    include: { members: { where: { status: "ACTIVE" }, select: { role: true } }, roleRates: true },
    take: 30,
  });
  if (crews.length === 0 && tradeSlug) {
    crews = await prisma.crew.findMany({
      where: { status: "ACTIVE" },
      include: { members: { where: { status: "ACTIVE" }, select: { role: true } }, roleRates: true },
      take: 30,
    });
  }
  return crews;
}

// ── Capacity / availability ──────────────────────────────────────────────────
// A crew can only take a job it can staff on every requested date: for each role,
// (active members of that role) − (already committed to overlapping jobs) ≥ requested.

type CommittedBooking = { dates: Set<string>; roles: Record<string, number> };

function rolesToMap(roles: CrewRoleRequest[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of roles) m[r.roleId] = (m[r.roleId] ?? 0) + Math.max(0, r.count);
  return m;
}

function bookingDates(startISO: string, days: number): string[] {
  return Array.from({ length: Math.max(1, days) }, (_, i) => addDaysISO(startISO, i));
}

function parseBookingDetails(raw: string): { roles: CrewRoleRequest[]; startDate?: string } {
  try {
    const d = JSON.parse(raw);
    return { roles: Array.isArray(d?.roles) ? d.roles : [], startDate: d?.startDate };
  } catch {
    return { roles: [] };
  }
}

/** Crew's active commitments (assigned/working) keyed by crewId, with their dates + role counts. */
async function loadCommitments(crewIds: string[], excludeBookingId?: string): Promise<Map<string, CommittedBooking[]>> {
  const map = new Map<string, CommittedBooking[]>();
  if (crewIds.length === 0) return map;
  const bookings = await prisma.booking.findMany({
    where: {
      crewId: { in: crewIds },
      status: { in: ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { crewId: true, archetypeDetails: true, durationDays: true },
  });
  for (const b of bookings) {
    if (!b.crewId) continue;
    const { roles, startDate } = parseBookingDetails(b.archetypeDetails);
    const committed: CommittedBooking = {
      dates: new Set(bookingDates(normalizeStartISO(startDate ?? ""), b.durationDays)),
      roles: rolesToMap(roles),
    };
    map.set(b.crewId, [...(map.get(b.crewId) ?? []), committed]);
  }
  return map;
}

/** True if the crew's roster can staff every requested role on every requested date. */
export function crewHasCapacity(
  members: { role: string }[],
  committed: CommittedBooking[],
  wanted: CrewRoleRequest[],
  dates: string[],
): boolean {
  const capacity: Record<string, number> = {};
  for (const m of members) capacity[m.role] = (capacity[m.role] ?? 0) + 1;
  for (const date of dates) {
    for (const w of wanted) {
      if (w.count <= 0) continue;
      let used = 0;
      for (const cb of committed) if (cb.dates.has(date)) used += cb.roles[w.roleId] ?? 0;
      if ((capacity[w.roleId] ?? 0) - used < w.count) return false;
    }
  }
  return true;
}

/** "Receive Quotes": crews priced by their own rate card, filtered to those that can actually staff the dates. */
export async function matchCrews(
  roles: CrewRoleRequest[],
  durationDays: number,
  opts: { tradeSlug?: string; limit?: number; startDate?: string } = {},
): Promise<CrewQuote[]> {
  const crews = await activeCrews(opts.tradeSlug);
  const wanted = roles.filter((r) => r.count > 0);
  const dates = opts.startDate ? bookingDates(normalizeStartISO(opts.startDate), durationDays) : [];
  const commitments = dates.length ? await loadCommitments(crews.map((c) => c.id)) : new Map();

  const quotes = crews
    .map((c) => ({
      quote: toQuote(c, roles, durationDays),
      available:
        toQuote(c, roles, durationDays).covers &&
        (dates.length === 0 || crewHasCapacity(c.members, commitments.get(c.id) ?? [], wanted, dates)),
    }))
    .filter((x) => x.available)
    .map((x) => x.quote)
    .sort((a, b) => b.rating - a.rating);
  return quotes.slice(0, opts.limit ?? 6);
}

function addDaysISO(startISO: string, days: number): string {
  const d = new Date(startISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeStartISO(startDate: string): string {
  const d = new Date(startDate);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

async function jobDayData(startISO: string, days: number) {
  return Array.from({ length: days }, (_, i) => ({ dayDate: addDaysISO(startISO, i) }));
}

/** 4-digit code the customer shares to gate start/finish of the job. */
export function genOtp(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

type CreateInput = {
  userId: string;
  serviceId: string;
  addressId: string;
  startDate: string;
  durationDays: number;
  roles: CrewRoleRequest[];
  issueDescription: string;
  mediaUrls: string[];
  siteLocation: string;
  tradeSlug: string;
};

/** "Receive Quotes": customer picked a specific crew → assigned immediately at that crew's price. */
export async function createCrewBookingDirect(input: CreateInput & { crewId: string }) {
  const days = Math.max(1, Math.floor(input.durationDays));
  const startISO = normalizeStartISO(input.startDate);
  const crew = await prisma.crew.findUnique({ where: { id: input.crewId }, include: { roleRates: true } });
  if (!crew || crew.status !== "ACTIVE") return null;

  const quotedAmount = dailyRateFromRates(crew.roleRates, input.roles) * days;

  return prisma.booking.create({
    data: {
      bookingRef: generateBookingRef(),
      userId: input.userId,
      serviceId: input.serviceId,
      addressId: input.addressId,
      crewId: crew.id,
      slot: new Date(`${startISO}T09:00:00`).toISOString(),
      scheduleType: "scheduled",
      archetype: "C",
      assignmentMode: "quotes",
      vendorAssignmentMode: "manual",
      status: "CREW_ASSIGNED",
      paymentStatus: "PENDING",
      paymentMethod: null,
      durationDays: days,
      baseChargePaise: Math.round(quotedAmount / days),
      quotedAmount,
      startOtp: genOtp(),
      endOtp: genOtp(),
      issueDescription: input.issueDescription,
      mediaUrls: JSON.stringify(input.mediaUrls),
      archetypeDetails: JSON.stringify({
        bookingType: "team",
        roles: input.roles,
        durationDays: days,
        startDate: startISO,
        siteLocation: input.siteLocation,
        crewName: crew.name,
      }),
      statusLogs: { create: { status: "CREW_ASSIGNED" } },
      crewJobDays: { create: await jobDayData(startISO, days) },
    },
    include: { crew: true },
  });
}

/** "Auto Assign": broadcast a request to every matching crew; first to accept wins. */
export async function createCrewBookingAuto(input: CreateInput) {
  const days = Math.max(1, Math.floor(input.durationDays));
  const startISO = normalizeStartISO(input.startDate);
  // Estimate using the platform rate card; finalized to the accepting crew's price on acceptance.
  const estimate = input.roles.reduce((s, r) => s + Math.max(0, r.count) * roleRatePaise(r.roleId), 0) * days;

  const booking = await prisma.booking.create({
    data: {
      bookingRef: generateBookingRef(),
      userId: input.userId,
      serviceId: input.serviceId,
      addressId: input.addressId,
      slot: new Date(`${startISO}T09:00:00`).toISOString(),
      scheduleType: "scheduled",
      archetype: "C",
      assignmentMode: "auto",
      vendorAssignmentMode: "auto",
      status: "SEARCHING_CREW",
      paymentStatus: "PENDING",
      paymentMethod: null,
      durationDays: days,
      baseChargePaise: Math.round(estimate / days),
      quotedAmount: estimate,
      issueDescription: input.issueDescription,
      mediaUrls: JSON.stringify(input.mediaUrls),
      archetypeDetails: JSON.stringify({
        bookingType: "team",
        roles: input.roles,
        durationDays: days,
        startDate: startISO,
        siteLocation: input.siteLocation,
      }),
      statusLogs: { create: { status: "SEARCHING_CREW" } },
    },
  });

  await broadcastCrewOffers(booking.id, input.tradeSlug);
  return booking;
}

/** Offer only to active crews of the trade that can actually staff the requested dates. */
export async function broadcastCrewOffers(bookingId: string, tradeSlug: string, excludeCrewId?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { archetypeDetails: true, durationDays: true },
  });
  const { roles, startDate } = booking ? parseBookingDetails(booking.archetypeDetails) : { roles: [], startDate: undefined };
  const wanted = roles.filter((r) => r.count > 0);
  const dates = bookingDates(normalizeStartISO(startDate ?? ""), booking?.durationDays ?? 1);

  const crews = await prisma.crew.findMany({
    where: { status: "ACTIVE", tradeSlug, ...(excludeCrewId ? { id: { not: excludeCrewId } } : {}) },
    include: { members: { where: { status: "ACTIVE" }, select: { role: true } } },
  });
  const commitments = await loadCommitments(crews.map((c) => c.id), bookingId);
  const eligible = crews.filter((c) => crewHasCapacity(c.members, commitments.get(c.id) ?? [], wanted, dates));

  if (eligible.length === 0) {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "NO_CREW_FOUND" } });
    await prisma.bookingStatusLog.create({ data: { bookingId, status: "NO_CREW_FOUND" } });
    return { offers: 0 };
  }
  const expiresAt = new Date(Date.now() + CREW_OFFER_TTL_SECONDS * 1000);
  await prisma.crewJobOffer.createMany({
    data: eligible.map((c) => ({ bookingId, crewId: c.id, expiresAt })),
  });
  return { offers: eligible.length, expiresAt };
}

/** Expire stale offers; if an auto booking has none left and no crew, mark NO_CREW_FOUND. */
export async function expireCrewOffers(bookingId: string) {
  const now = new Date();
  await prisma.crewJobOffer.updateMany({
    where: { bookingId, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED", respondedAt: now },
  });
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.crewId || booking.status !== "SEARCHING_CREW") return;
  const pending = await prisma.crewJobOffer.count({ where: { bookingId, status: "PENDING", expiresAt: { gt: now } } });
  if (pending === 0) {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "NO_CREW_FOUND" } });
    await prisma.bookingStatusLog.create({ data: { bookingId, status: "NO_CREW_FOUND" } });
  }
}

/** Re-broadcast a failed auto booking. */
export async function retryCrewBooking(bookingRef: string, userId: string, tradeSlug: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId } });
  if (!booking || booking.crewId) return { ok: false as const, error: "Cannot retry" };
  if (booking.status !== "NO_CREW_FOUND") return { ok: false as const, error: "Cannot retry" };
  await prisma.crewJobOffer.deleteMany({ where: { bookingId: booking.id } });
  await prisma.booking.update({ where: { id: booking.id }, data: { status: "SEARCHING_CREW" } });
  await prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "SEARCHING_CREW" } });
  await broadcastCrewOffers(booking.id, tradeSlug);
  return { ok: true as const };
}

export function isCrewBooking(b: { crewId?: string | null; archetype?: string; assignmentMode?: string }): boolean {
  return Boolean(b.crewId) || b.archetype === "C" || b.assignmentMode === "auto";
}

/** Mobilization / cancellation fee = 15% of one day's crew rate. */
const CANCEL_FEE_RATE = 0.15;

function parseRolesFromDetails(raw: string): CrewRoleRequest[] {
  try {
    const d = JSON.parse(raw);
    return Array.isArray(d?.roles) ? d.roles : [];
  } catch {
    return [];
  }
}

/**
 * Tiered cancellation:
 *  - SEARCHING_CREW / CREW_ASSIGNED → free
 *  - CREW_EN_ROUTE → mobilization fee (compensates crew travel)
 *  - CREW_WORKING → pay completed days + a cancellation fee; remaining days voided
 */
export async function cancelCrewBooking(bookingRef: string, userId: string, reason?: string) {
  const booking = await prisma.booking.findFirst({
    where: { bookingRef, userId },
    include: { crew: { include: { roleRates: true } }, crewJobDays: true },
  });
  if (!booking) return null;
  if (["COMPLETED", "CANCELLED"].includes(booking.status)) {
    return { error: "This booking can no longer be cancelled" as const };
  }

  const roles = parseRolesFromDetails(booking.archetypeDetails);
  const dailyRate = booking.crew ? dailyRateFromRates(booking.crew.roleRates, roles) : 0;

  let feePaise = 0;
  let finalPaise = 0;
  if (booking.status === "CREW_EN_ROUTE") {
    feePaise = Math.round(dailyRate * CANCEL_FEE_RATE);
    finalPaise = feePaise;
  } else if (booking.status === "CREW_WORKING") {
    const done = booking.crewJobDays
      .filter((d) => ["DAY_DONE", "APPROVED"].includes(d.status))
      .reduce((s, d) => s + d.earnedPaise, 0);
    feePaise = Math.round(dailyRate * CANCEL_FEE_RATE);
    finalPaise = done + feePaise;
  }

  // Settle from escrow: withhold the fee, refund the rest to the customer.
  const refundedPaise = Math.max(0, booking.escrowPaise - finalPaise);
  const settledStatus = finalPaise > 0 ? "PAID" : "REFUNDED";

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason ?? null,
        cancelFeePaise: feePaise,
        finalAmountPaise: finalPaise,
        refundedPaise,
        paymentStatus: settledStatus,
      },
    }),
    prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "CANCELLED" } }),
    prisma.crewJobOffer.updateMany({ where: { bookingId: booking.id, status: "PENDING" }, data: { status: "EXPIRED" } }),
    prisma.crewJobDay.updateMany({
      where: { bookingId: booking.id, status: { in: ["SCHEDULED", "WORKING"] } },
      data: { status: "CANCELLED" },
    }),
  ]);

  return { ok: true as const, feePaise, finalPaise, refundedPaise };
}

/** Preview the fee the customer would pay if they cancel right now (no mutation). */
export function previewCancelFee(
  status: string,
  dailyRatePaise: number,
  doneEarnedPaise: number,
): { feePaise: number; finalPaise: number; free: boolean } {
  if (status === "CREW_EN_ROUTE") {
    const fee = Math.round(dailyRatePaise * CANCEL_FEE_RATE);
    return { feePaise: fee, finalPaise: fee, free: false };
  }
  if (status === "CREW_WORKING") {
    const fee = Math.round(dailyRatePaise * CANCEL_FEE_RATE);
    return { feePaise: fee, finalPaise: doneEarnedPaise + fee, free: false };
  }
  return { feePaise: 0, finalPaise: 0, free: true };
}

// ── Per-day reschedule ───────────────────────────────────────────────────────
// ≥24h notice auto-confirms (if the crew is free that date); <24h needs the lead
// to confirm. Max 2 applied reschedules per booking; only future, not-yet-started
// days can move. Reschedule = free the old date + commit the new date.

export const MAX_RESCHEDULES = 2;
const RESCHEDULE_AUTO_NOTICE_HOURS = 24;

/** Can the crew staff this booking's roles on a single date (excluding this booking)? */
export async function canCrewServeDate(
  crewId: string,
  roles: CrewRoleRequest[],
  date: string,
  excludeBookingId: string,
): Promise<boolean> {
  const crew = await prisma.crew.findUnique({
    where: { id: crewId },
    include: { members: { where: { status: "ACTIVE" }, select: { role: true } } },
  });
  if (!crew) return false;
  const commitments = await loadCommitments([crewId], excludeBookingId);
  return crewHasCapacity(crew.members, commitments.get(crewId) ?? [], roles.filter((r) => r.count > 0), [date]);
}

export async function requestReschedule(bookingRef: string, userId: string, dayId: string, newDate: string) {
  const booking = await prisma.booking.findFirst({
    where: { bookingRef, userId },
    include: { crewJobDays: true },
  });
  if (!booking || !booking.crewId) return { error: "Booking not found" as const };
  if (["COMPLETED", "CANCELLED", "NO_CREW_FOUND", "SEARCHING_CREW"].includes(booking.status)) {
    return { error: "This booking can't be rescheduled" as const };
  }
  if (booking.rescheduleCount >= MAX_RESCHEDULES) return { error: "Reschedule limit reached (max 2)" as const };

  const day = booking.crewJobDays.find((d) => d.id === dayId);
  if (!day) return { error: "Day not found" as const };
  if (day.status !== "SCHEDULED") return { error: "Only days that haven't started can be moved" as const };
  if (day.rescheduleToDate) return { error: "A reschedule is already pending for this day" as const };

  const newISO = normalizeStartISO(newDate);
  const todayISO = new Date().toISOString().slice(0, 10);
  if (newISO <= todayISO) return { error: "Pick a future date" as const };
  if (day.dayDate <= todayISO) return { error: "This day can no longer be moved" as const };
  if (newISO === day.dayDate) return { error: "Pick a different date" as const };
  if (booking.crewJobDays.some((d) => d.id !== dayId && d.dayDate === newISO && d.status !== "CANCELLED")) {
    return { error: "You already have a work day on that date" as const };
  }

  const roles = parseRolesFromDetails(booking.archetypeDetails);
  if (!(await canCrewServeDate(booking.crewId, roles, newISO, booking.id))) {
    return { error: "The crew is fully booked on that date. Try another." as const };
  }

  const noticeHrs = (new Date(`${day.dayDate}T00:00:00`).getTime() - Date.now()) / 3.6e6;
  if (noticeHrs >= RESCHEDULE_AUTO_NOTICE_HOURS) {
    await prisma.crewJobDay.update({ where: { id: dayId }, data: { dayDate: newISO } });
    await prisma.booking.update({ where: { id: booking.id }, data: { rescheduleCount: { increment: 1 } } });
    return { ok: true as const, applied: true, newDate: newISO };
  }
  await prisma.crewJobDay.update({ where: { id: dayId }, data: { rescheduleToDate: newISO } });
  return { ok: true as const, applied: false, newDate: newISO };
}

// ── Abandonment / dispute / extension (Phase F) ──────────────────────────────

/** Customer reports the crew never showed up. Penalise the crew + re-broadcast to others. */
export async function reportNoShow(bookingRef: string, userId: string, tradeSlug: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId }, include: { crewJobDays: true } });
  if (!booking || !booking.crewId) return { error: "Booking not found" as const };
  if (booking.startConfirmedAt) return { error: "Work has already started" as const };
  if (!["CREW_ASSIGNED", "CREW_EN_ROUTE"].includes(booking.status)) return { error: "Can't report a no-show right now" as const };

  const firstDay = booking.crewJobDays.map((d) => d.dayDate).sort()[0];
  const todayISO = new Date().toISOString().slice(0, 10);
  if (!firstDay || firstDay > todayISO) return { error: "You can report a no-show once the start date has arrived." as const };

  const abandoningCrewId = booking.crewId;
  await prisma.crew.update({ where: { id: abandoningCrewId }, data: { noShowCount: { increment: 1 } } });
  await prisma.crewJobOffer.deleteMany({ where: { bookingId: booking.id } });
  await prisma.crewJobDay.deleteMany({ where: { bookingId: booking.id } });
  await prisma.booking.update({ where: { id: booking.id }, data: { crewId: null, status: "SEARCHING_CREW", startConfirmedAt: null } });
  await prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "SEARCHING_CREW" } });
  await broadcastCrewOffers(booking.id, tradeSlug, abandoningCrewId);
  return { ok: true as const };
}

/** Customer reports an issue after completion — holds the payout for ops review. */
export async function reportDispute(bookingRef: string, userId: string, reason?: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId } });
  if (!booking) return { error: "Booking not found" as const };
  if (booking.status !== "COMPLETED") return { error: "Only completed jobs can be reported" as const };
  if (booking.paymentStatus === "DISPUTED") return { ok: true as const };
  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: "DISPUTED", disputedAt: new Date(), disputeReason: reason?.slice(0, 300) ?? null },
  });
  return { ok: true as const };
}

/** Customer approves the lead's extra-days request — adds days and tops up escrow at the same rates. */
export async function approveExtension(bookingRef: string, userId: string, paymentMethod: string) {
  const booking = await prisma.booking.findFirst({
    where: { bookingRef, userId },
    include: { crew: { include: { roleRates: true } }, crewJobDays: true },
  });
  if (!booking || !booking.crew) return { error: "Booking not found" as const };
  if (booking.extensionDays <= 0) return { error: "No extension to approve" as const };
  if (booking.status !== "CREW_WORKING") return { error: "Extensions apply to in-progress jobs only" as const };

  const extra = booking.extensionDays;
  const lastDay = [...booking.crewJobDays.map((d) => d.dayDate)].sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  const newDates = Array.from({ length: extra }, (_, i) => addDaysISO(lastDay, i + 1));

  const roles = parseRolesFromDetails(booking.archetypeDetails);
  for (const date of newDates) {
    if (!(await canCrewServeDate(booking.crewId!, roles, date, booking.id))) {
      return { error: "The crew isn't free for the extra days anymore." as const };
    }
  }
  const extraCharge = dailyRateFromRates(booking.crew.roleRates, roles) * extra;

  await prisma.crewJobDay.createMany({ data: newDates.map((dayDate) => ({ bookingId: booking.id, dayDate })) });
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      durationDays: { increment: extra },
      quotedAmount: { increment: extraCharge },
      escrowPaise: { increment: extraCharge },
      extensionDays: 0,
      paymentMethod,
    },
  });
  return { ok: true as const, extraCharge, addedDays: extra };
}

export async function declineExtension(bookingRef: string, userId: string) {
  const booking = await prisma.booking.findFirst({ where: { bookingRef, userId } });
  if (!booking) return { error: "Booking not found" as const };
  await prisma.booking.update({ where: { id: booking.id }, data: { extensionDays: 0 } });
  return { ok: true as const };
}

/** Extra cost (paise) if the pending extension is approved — for display. */
export async function extensionQuote(bookingRef: string, userId: string): Promise<number> {
  const booking = await prisma.booking.findFirst({
    where: { bookingRef, userId },
    include: { crew: { include: { roleRates: true } } },
  });
  if (!booking || !booking.crew || booking.extensionDays <= 0) return 0;
  const roles = parseRolesFromDetails(booking.archetypeDetails);
  return dailyRateFromRates(booking.crew.roleRates, roles) * booking.extensionDays;
}
