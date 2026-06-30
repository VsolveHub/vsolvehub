import "server-only";
import { prisma } from "@vsolve/db";
import { bookingDates, normalizeStartISO, parseDetails } from "./crew-capacity";

/**
 * Lead picks the specific members for a job. Only assigned members may clock in.
 * A member can't be assigned to two active jobs whose dates overlap.
 */

const ACTIVE = ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"] as const;

async function bookingDateSet(archetypeDetails: string, durationDays: number): Promise<Set<string>> {
  const { startDate } = parseDetails(archetypeDetails);
  return new Set(bookingDates(normalizeStartISO(startDate ?? ""), durationDays));
}

/** Members already committed to another active booking that overlaps this booking's dates. */
export async function busyMemberIds(crewId: string, bookingId: string): Promise<Set<string>> {
  const me = await prisma.booking.findUnique({ where: { id: bookingId }, select: { archetypeDetails: true, durationDays: true } });
  if (!me) return new Set();
  const myDates = await bookingDateSet(me.archetypeDetails, me.durationDays);

  const assignments = await prisma.crewAssignment.findMany({
    where: { member: { crewId }, bookingId: { not: bookingId }, booking: { status: { in: [...ACTIVE] } } },
    include: { booking: { select: { archetypeDetails: true, durationDays: true } } },
  });
  const busy = new Set<string>();
  for (const a of assignments) {
    const dates = bookingDates(normalizeStartISO(parseDetails(a.booking.archetypeDetails).startDate ?? ""), a.booking.durationDays);
    if (dates.some((d) => myDates.has(d))) busy.add(a.crewMemberId);
  }
  return busy;
}

type Result = { ok: boolean; error?: string };

async function ownedActiveBooking(partnerId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { crew: { select: { id: true, leadPartnerId: true } } },
  });
  if (!booking || booking.crew?.leadPartnerId !== partnerId) return null;
  return booking;
}

export async function assignMember(partnerId: string, bookingId: string, memberId: string): Promise<Result> {
  const booking = await ownedActiveBooking(partnerId, bookingId);
  if (!booking || !booking.crew) return { ok: false, error: "Job not found" };
  if (["COMPLETED", "CANCELLED"].includes(booking.status)) return { ok: false, error: "This job is closed" };

  const member = await prisma.crewMember.findFirst({ where: { id: memberId, crewId: booking.crew.id, status: "ACTIVE" } });
  if (!member) return { ok: false, error: "Member not found" };

  const booked = parseDetails(booking.archetypeDetails).roles.find((r) => r.roleId === member.role)?.count ?? 0;
  if (booked <= 0) return { ok: false, error: "This role isn't needed for this job" };

  const already = await prisma.crewAssignment.findUnique({
    where: { bookingId_crewMemberId: { bookingId, crewMemberId: memberId } },
  });
  if (already) return { ok: true };

  const assignedForRole = await prisma.crewAssignment.count({ where: { bookingId, member: { role: member.role } } });
  if (assignedForRole >= booked) return { ok: false, error: "All slots for this role are filled" };

  const busy = await busyMemberIds(booking.crew.id, bookingId);
  if (busy.has(memberId)) return { ok: false, error: "Member is on another job those days" };

  await prisma.crewAssignment.create({ data: { bookingId, crewMemberId: memberId } });
  return { ok: true };
}

export async function unassignMember(partnerId: string, bookingId: string, memberId: string): Promise<Result> {
  const booking = await ownedActiveBooking(partnerId, bookingId);
  if (!booking) return { ok: false, error: "Job not found" };

  const clocked = await prisma.crewClockEvent.findFirst({ where: { crewMemberId: memberId, jobDay: { bookingId } } });
  if (clocked) return { ok: false, error: "Member has already clocked in" };

  await prisma.crewAssignment.deleteMany({ where: { bookingId, crewMemberId: memberId } });
  return { ok: true };
}

export async function isAssigned(bookingId: string, memberId: string): Promise<boolean> {
  const a = await prisma.crewAssignment.findUnique({
    where: { bookingId_crewMemberId: { bookingId, crewMemberId: memberId } },
  });
  return Boolean(a);
}

export async function hasAnyAssignment(bookingId: string): Promise<boolean> {
  return (await prisma.crewAssignment.count({ where: { bookingId } })) > 0;
}
