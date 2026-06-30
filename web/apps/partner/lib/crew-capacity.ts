import "server-only";
import { prisma } from "@vsolve/db";

/**
 * Capacity guard. A crew can only take a booking it can staff on every day:
 * for each requested role, (active members) − (committed to other overlapping
 * jobs) ≥ requested. Used to re-check on accept (broadcast already pre-filters).
 */

export type Roles = { roleId: string; count: number }[];

function addDaysISO(startISO: string, days: number): string {
  const d = new Date(startISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
export function normalizeStartISO(startDate: string): string {
  const d = new Date(startDate);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}
export function bookingDates(startISO: string, days: number): string[] {
  return Array.from({ length: Math.max(1, days) }, (_, i) => addDaysISO(startISO, i));
}
function rolesToMap(roles: Roles): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of roles) m[r.roleId] = (m[r.roleId] ?? 0) + Math.max(0, r.count);
  return m;
}
export function parseDetails(raw: string): { roles: Roles; startDate?: string } {
  try {
    const d = JSON.parse(raw);
    return { roles: Array.isArray(d?.roles) ? d.roles : [], startDate: d?.startDate };
  } catch {
    return { roles: [] };
  }
}

/** Can the crew staff these roles on a single date (excluding one booking)? */
export async function crewCanServeDate(
  crewId: string,
  roles: Roles,
  date: string,
  excludeBookingId: string,
): Promise<boolean> {
  const wanted = roles.filter((r) => r.count > 0);
  const [members, others] = await Promise.all([
    prisma.crewMember.findMany({ where: { crewId, status: "ACTIVE" }, select: { role: true } }),
    prisma.booking.findMany({
      where: { crewId, status: { in: ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"] }, id: { not: excludeBookingId } },
      select: { archetypeDetails: true, durationDays: true },
    }),
  ]);
  const capacity: Record<string, number> = {};
  for (const m of members) capacity[m.role] = (capacity[m.role] ?? 0) + 1;
  const committed = others.map((b) => {
    const d = parseDetails(b.archetypeDetails);
    return { dates: new Set(bookingDates(normalizeStartISO(d.startDate ?? ""), b.durationDays)), roles: rolesToMap(d.roles) };
  });
  for (const w of wanted) {
    let used = 0;
    for (const c of committed) if (c.dates.has(date)) used += c.roles[w.roleId] ?? 0;
    if ((capacity[w.roleId] ?? 0) - used < w.count) return false;
  }
  return true;
}

export async function crewCanTakeBooking(crewId: string, bookingId: string): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { archetypeDetails: true, durationDays: true },
  });
  if (!booking) return false;
  const { roles, startDate } = parseDetails(booking.archetypeDetails);
  const wanted = roles.filter((r) => r.count > 0);
  const dates = bookingDates(normalizeStartISO(startDate ?? ""), booking.durationDays);

  const [members, others] = await Promise.all([
    prisma.crewMember.findMany({ where: { crewId, status: "ACTIVE" }, select: { role: true } }),
    prisma.booking.findMany({
      where: { crewId, status: { in: ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"] }, id: { not: bookingId } },
      select: { archetypeDetails: true, durationDays: true },
    }),
  ]);

  const capacity: Record<string, number> = {};
  for (const m of members) capacity[m.role] = (capacity[m.role] ?? 0) + 1;
  const committed = others.map((b) => {
    const d = parseDetails(b.archetypeDetails);
    return { dates: new Set(bookingDates(normalizeStartISO(d.startDate ?? ""), b.durationDays)), roles: rolesToMap(d.roles) };
  });

  for (const date of dates) {
    for (const w of wanted) {
      let used = 0;
      for (const c of committed) if (c.dates.has(date)) used += c.roles[w.roleId] ?? 0;
      if ((capacity[w.roleId] ?? 0) - used < w.count) return false;
    }
  }
  return true;
}
