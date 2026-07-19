// ─────────────────────────────────────────────────────────────────────────────
// Shared availability matcher — the single source of truth for "who can take
// this job", consulted three times: the pre-payment UI gate, the server-side
// gate inside POST /api/bookings, and direct assignment itself. Because all
// three call the same pure functions, the gate can never promise a professional
// that assignment can't actually produce.
//
// Direct assignment (Urban-Company-style, not offer/accept): there is no
// "online and waiting for an offer" step for scheduled bookings — the job lands
// on the partner's calendar. `isOnline` therefore only gates INSTANT bookings,
// where there is no calendar to check and "available" means "free right now".
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_RADIUS_KM = 25;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type AvailabilityRow = {
  dayOfWeek: number | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  type: string;
};

/** True when a partner's availability rows permit work at the given slot. */
export function slotMatchesAvailability(slot: string, availability: AvailabilityRow[]): boolean {
  if (availability.length === 0) return true;

  const slotDate = new Date(slot);
  const dow = slotDate.getDay();
  const dateStr = slotDate.toISOString().slice(0, 10);
  const timeStr = slotDate.toTimeString().slice(0, 5);

  const blocks = availability.filter((a) => a.type === "blocked");
  for (const block of blocks) {
    if (block.date === dateStr) return false;
    if (block.dayOfWeek === dow) return false;
  }

  const windows = availability.filter((a) => a.type === "available");
  if (windows.length === 0) return true;

  return windows.some((a) => {
    const dayOk = a.dayOfWeek == null || a.dayOfWeek === dow;
    const dateOk = a.date == null || a.date === dateStr;
    if (!dayOk && !dateOk) return false;
    if (a.startTime && a.endTime) {
      return timeStr >= a.startTime && timeStr <= a.endTime;
    }
    return true;
  });
}

export type CandidatePartner = {
  id: string;
  lat: number | null;
  lng: number | null;
  rating: number;
  availability: AvailabilityRow[];
  trade: { slug: string } | null;
  skills: { skill: { slug: string } }[];
};

export type MatchContext = {
  addrLat: number;
  addrLng: number;
  slot: string;
  scheduleType: "instant" | "scheduled";
  service: { slug: string; subCategory: { slug: string } | null };
};

function partnerMatchesService(partner: CandidatePartner, service: MatchContext["service"]): boolean {
  const subSlug = service.subCategory?.slug;
  if (!subSlug) return true;
  if (partner.trade?.slug === subSlug) return true;
  return partner.skills.some((s) => s.skill.slug === service.slug || s.skill.slug === subSlug);
}

function withinServiceArea(partner: CandidatePartner, addrLat: number, addrLng: number): boolean {
  if (partner.lat == null || partner.lng == null) return true;
  return haversineKm(partner.lat, partner.lng, addrLat, addrLng) <= SERVICE_RADIUS_KM;
}

function matchesServiceAndArea(partner: CandidatePartner, ctx: MatchContext): boolean {
  return partnerMatchesService(partner, ctx.service) && withinServiceArea(partner, ctx.addrLat, ctx.addrLng);
}

/**
 * Trade/skill + service-area matched partners, WITHOUT the slot-availability
 * check. This is the "pool" slot suggestions walk against other candidate
 * slots — computing it once here means suggesting alternatives costs no extra
 * database query.
 */
export function poolPartners(partners: CandidatePartner[], ctx: MatchContext): CandidatePartner[] {
  return partners.filter((p) => matchesServiceAndArea(p, ctx));
}

/**
 * Pure hard gates: skill/trade match, service-area radius, availability
 * windows, and an arbitrary exclude set. The caller decides what belongs in
 * `excludeIds` — currently-busy partners for instant, slot-conflicted partners
 * for scheduled — so this function stays a dumb, testable filter.
 */
export function filterEligible(
  partners: CandidatePartner[],
  ctx: MatchContext,
  excludeIds: Set<string>,
): CandidatePartner[] {
  return poolPartners(partners, ctx).filter(
    (p) => !excludeIds.has(p.id) && slotMatchesAvailability(ctx.slot, p.availability),
  );
}

const WEIGHT_PROXIMITY = 0.5;
const WEIGHT_RATING = 0.3;
const WEIGHT_FAIRNESS = 0.2;
/** Recent-assignment count treated as "fully loaded" for the fairness term. */
const FAIRNESS_SATURATION = 8;

function scorePartner(partner: CandidatePartner, ctx: MatchContext, recentAssignments: Map<string, number>): number {
  const distanceKm =
    partner.lat != null && partner.lng != null
      ? haversineKm(partner.lat, partner.lng, ctx.addrLat, ctx.addrLng)
      : 0;
  const proximity = 1 - Math.min(distanceKm, SERVICE_RADIUS_KM) / SERVICE_RADIUS_KM;
  const ratingScore = Math.max(0, Math.min(1, partner.rating / 5));
  const recent = recentAssignments.get(partner.id) ?? 0;
  const fairness = 1 - Math.min(recent, FAIRNESS_SATURATION) / FAIRNESS_SATURATION;

  return WEIGHT_PROXIMITY * proximity + WEIGHT_RATING * ratingScore + WEIGHT_FAIRNESS * fairness;
}

/**
 * Pure ranking: proximity + rating + fairness (fewer recent assignments ranks
 * higher, so one partner does not absorb every job). Does not mutate its input.
 */
export function rankPartners(
  partners: CandidatePartner[],
  ctx: MatchContext,
  recentAssignments: Map<string, number>,
): CandidatePartner[] {
  return [...partners].sort((a, b) => scorePartner(b, ctx, recentAssignments) - scorePartner(a, ctx, recentAssignments));
}

// ─── Prisma wrapper ───────────────────────────────────────────────────────────
// The only part of this module that touches the database. Everything above is
// pure and unit-tested; this function's job is just to load candidates and hand
// them to the pure core.

import { prisma } from "@/lib/db/client";

/** Recent-assignment window for the fairness ranking term. */
const FAIRNESS_WINDOW_DAYS = 7;

export const candidatePartnerInclude = {
  availability: true,
  trade: { select: { slug: true } },
  skills: { include: { skill: { select: { slug: true } } } },
} as const;

export type FindAvailableInput = {
  service: { slug: string; subCategory: { slug: string } | null };
  addrLat: number;
  addrLng: number;
  slot: string;
  scheduleType: "instant" | "scheduled";
  excludePartnerIds?: string[];
};

export type FindAvailableResult = {
  /** Eligible, ranked best-first. Empty means no professional can take this slot. */
  ranked: CandidatePartner[];
  /** Trade/area-matched partners before the slot filter — feeds slot suggestions. */
  pool: CandidatePartner[];
};

/** Partners currently mid-job, right now — the "busy" exclusion for instant bookings. */
async function busyRightNow(excludePartnerIds: string[]): Promise<Set<string>> {
  const rows = await prisma.booking.findMany({
    where: {
      assignedPartnerId: { not: null, notIn: excludePartnerIds },
      status: { in: ["ASSIGNED", "PROVIDER_ARRIVING", "STARTED"] },
    },
    select: { assignedPartnerId: true },
  });
  return new Set(rows.map((r) => r.assignedPartnerId!));
}

/** Partners already holding an active booking at this exact slot (scheduled conflict). */
async function busyAtSlot(slot: string, excludePartnerIds: string[]): Promise<Set<string>> {
  const rows = await prisma.booking.findMany({
    where: {
      assignedPartnerId: { not: null, notIn: excludePartnerIds },
      slot,
      status: { in: ["ASSIGNED", "PROVIDER_ARRIVING", "STARTED"] },
    },
    select: { assignedPartnerId: true },
  });
  return new Set(rows.map((r) => r.assignedPartnerId!));
}

async function recentAssignmentCounts(): Promise<Map<string, number>> {
  const since = new Date(Date.now() - FAIRNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const grouped = await prisma.jobAssignment.groupBy({
    by: ["partnerId"],
    where: { status: "ACCEPTED", offeredAt: { gte: since } },
    _count: { partnerId: true },
  });
  return new Map(grouped.map((g) => [g.partnerId, g._count.partnerId]));
}

/**
 * Load and rank every partner eligible for a slot. Direct assignment (no
 * offer/accept) means there is no wave size to cap at — the full ranked list is
 * returned and the caller walks it until one assigns cleanly.
 */
export async function findAvailablePartners(input: FindAvailableInput): Promise<FindAvailableResult> {
  const exclude = input.excludePartnerIds ?? [];

  const [rawPartners, busyIds, recentAssignments] = await Promise.all([
    prisma.partner.findMany({
      where: {
        providerType: "CAPTAIN",
        status: "ACTIVE",
        id: { notIn: exclude },
        // isOnline only gates INSTANT — a scheduled job lands on the partner's
        // calendar regardless of whether they happen to be online right now.
        ...(input.scheduleType === "instant" ? { isOnline: true } : {}),
      },
      include: candidatePartnerInclude,
      take: 200,
    }),
    input.scheduleType === "instant" ? busyRightNow(exclude) : busyAtSlot(input.slot, exclude),
    recentAssignmentCounts(),
  ]);

  const ctx: MatchContext = {
    addrLat: input.addrLat,
    addrLng: input.addrLng,
    slot: input.slot,
    scheduleType: input.scheduleType,
    service: input.service,
  };

  const pool = poolPartners(rawPartners, ctx);
  const eligible = filterEligible(rawPartners, ctx, busyIds);
  const ranked = rankPartners(eligible, ctx, recentAssignments);

  return { ranked, pool };
}

export type PublicPartner = { id: string; name: string; rating: number; jobsCompleted: number };
