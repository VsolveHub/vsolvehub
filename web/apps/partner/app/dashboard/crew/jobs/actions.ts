"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vsolve/db";
import { requirePartner } from "@/lib/auth";
import { defaultRoleRatePaise } from "@/lib/crew-constants";
import { crewCanServeDate, bookingDates } from "@/lib/crew-capacity";
import { assignMember, unassignMember } from "@/lib/crew-assign";

export type JobActionResult = { ok?: boolean; error?: string };

const PATH = "/dashboard/crew/jobs";

function parseRoles(raw: string): { roleId: string; count: number }[] {
  try {
    const d = JSON.parse(raw);
    return Array.isArray(d?.roles) ? d.roles : [];
  } catch {
    return [];
  }
}

/** Loads a job-day only if it belongs to a booking for this partner's crew. */
async function ownedJobDay(partnerId: string, jobDayId: string) {
  const day = await prisma.crewJobDay.findUnique({
    where: { id: jobDayId },
    include: { booking: { include: { crew: { select: { id: true, leadPartnerId: true } } } } },
  });
  if (!day || day.booking.crew?.leadPartnerId !== partnerId) return null;
  return day;
}

async function ownedBooking(partnerId: string, bookingId: string) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { crew: { select: { id: true, leadPartnerId: true } } },
  });
  if (!b || b.crew?.leadPartnerId !== partnerId) return null;
  return b;
}

async function logBooking(bookingId: string, status: string) {
  await prisma.booking.update({ where: { id: bookingId }, data: { status } });
  await prisma.bookingStatusLog.create({ data: { bookingId, status } });
}

export async function setEnRoute(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const booking = await ownedBooking(partner.id, String(formData.get("bookingId") ?? ""));
  if (!booking || booking.status !== "CREW_ASSIGNED") return;
  if (booking.paymentStatus !== "ESCROW_HELD") return; // can't mobilise before the customer pays
  await logBooking(booking.id, "CREW_EN_ROUTE");
  revalidatePath(PATH);
}

/** Gate 1 — customer's start code begins the job. Clock-in is blocked until this passes. */
export async function startJob(_prev: JobActionResult, formData: FormData): Promise<JobActionResult> {
  const partner = await requirePartner();
  const booking = await ownedBooking(partner.id, String(formData.get("bookingId") ?? ""));
  if (!booking) return { error: "Job not found" };
  if (booking.startConfirmedAt) return { ok: true };
  if (!["CREW_ASSIGNED", "CREW_EN_ROUTE"].includes(booking.status)) return { error: "Job already started" };
  if (booking.paymentStatus !== "ESCROW_HELD") {
    return { error: "Waiting for the customer to pay the booking amount into escrow." };
  }

  const otp = String(formData.get("otp") ?? "").trim();
  if (!booking.startOtp || otp !== booking.startOtp) {
    return { error: "Wrong start code. Ask the customer for their start code." };
  }
  await prisma.booking.update({ where: { id: booking.id }, data: { startConfirmedAt: new Date(), status: "CREW_WORKING" } });
  await prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "CREW_WORKING" } });
  revalidatePath(PATH);
  return { ok: true };
}

/** Clock a member in — only after the job has started, only same-role members, capped at the booked count. */
export async function clockIn(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const jobDayId = String(formData.get("jobDayId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const day = await ownedJobDay(partner.id, jobDayId);
  if (!day || day.status === "CANCELLED") return;
  if (!day.booking.startConfirmedAt) return; // start gate not passed

  const member = await prisma.crewMember.findFirst({
    where: { id: memberId, crewId: day.booking.crew!.id, status: "ACTIVE" },
  });
  if (!member) return;

  // Role must be in the booked composition, and not over its booked count for the day.
  const booked = parseRoles(day.booking.archetypeDetails).find((r) => r.roleId === member.role)?.count ?? 0;
  if (booked <= 0) return;

  const events = await prisma.crewClockEvent.findMany({
    where: { crewJobDayId: jobDayId },
    include: { member: { select: { role: true } } },
  });
  if (events.some((e) => e.crewMemberId === memberId && !e.clockOutAt)) return; // already in
  const distinctForRole = new Set(events.filter((e) => e.member.role === member.role).map((e) => e.crewMemberId));
  if (!distinctForRole.has(memberId) && distinctForRole.size >= booked) return; // role slots full

  await prisma.crewClockEvent.create({ data: { crewJobDayId: jobDayId, crewMemberId: memberId, source: "MANUAL" } });
  if (day.status === "SCHEDULED") {
    await prisma.crewJobDay.update({ where: { id: jobDayId }, data: { status: "WORKING" } });
  }
  revalidatePath(PATH);
}

export async function clockOut(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const jobDayId = String(formData.get("jobDayId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const day = await ownedJobDay(partner.id, jobDayId);
  if (!day) return;
  await prisma.crewClockEvent.updateMany({
    where: { crewJobDayId: jobDayId, crewMemberId: memberId, clockOutAt: null },
    data: { clockOutAt: new Date() },
  });
  revalidatePath(PATH);
}

/** Finish a day: clock everyone out and price the day by who actually attended (pro-rated). */
export async function finishDay(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const jobDayId = String(formData.get("jobDayId") ?? "");
  const day = await ownedJobDay(partner.id, jobDayId);
  if (!day || day.status === "CANCELLED") return;

  await prisma.crewClockEvent.updateMany({ where: { crewJobDayId: jobDayId, clockOutAt: null }, data: { clockOutAt: new Date() } });

  const [events, rates] = await Promise.all([
    prisma.crewClockEvent.findMany({ where: { crewJobDayId: jobDayId }, include: { member: { select: { id: true, role: true } } } }),
    prisma.crewRoleRate.findMany({ where: { crewId: day.booking.crew!.id } }),
  ]);
  const rateFor = (role: string) => rates.find((r) => r.role === role)?.dayRatePaise ?? defaultRoleRatePaise(role);
  const present = new Map<string, string>();
  for (const e of events) present.set(e.crewMemberId, e.member.role);
  const earnedPaise = [...present.values()].reduce((s, role) => s + rateFor(role), 0);

  await prisma.crewJobDay.update({ where: { id: jobDayId }, data: { status: "DAY_DONE", earnedPaise } });
  revalidatePath(PATH);
}

/** Gate 2 — customer's completion code finalizes the job. Final price = sum of attended days. */
export async function completeJob(_prev: JobActionResult, formData: FormData): Promise<JobActionResult> {
  const partner = await requirePartner();
  const booking = await ownedBooking(partner.id, String(formData.get("bookingId") ?? ""));
  if (!booking) return { error: "Job not found" };
  if (booking.status === "COMPLETED") return { ok: true };

  const otp = String(formData.get("otp") ?? "").trim();
  if (!booking.endOtp || otp !== booking.endOtp) {
    return { error: "Wrong completion code. Ask the customer for their completion code." };
  }
  const remaining = await prisma.crewJobDay.count({
    where: { bookingId: booking.id, status: { notIn: ["DAY_DONE", "APPROVED", "CANCELLED"] } },
  });
  if (remaining > 0) return { error: "Finish all work days before completing." };

  const days = await prisma.crewJobDay.findMany({
    where: { bookingId: booking.id, status: { in: ["DAY_DONE", "APPROVED"] } },
    select: { earnedPaise: true },
  });
  const finalAmountPaise = days.reduce((s, d) => s + d.earnedPaise, 0);
  // Settle from escrow: charge the attended total, refund the no-show shortfall.
  const refundedPaise = Math.max(0, booking.escrowPaise - finalAmountPaise);

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "COMPLETED", finalAmountPaise, refundedPaise, paymentStatus: "PAID" },
  });
  await prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "COMPLETED" } });
  revalidatePath(PATH);
  return { ok: true };
}

/** Lead confirms a <24h reschedule request (re-checks capacity on the new date). */
export async function confirmReschedule(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const dayId = String(formData.get("dayId") ?? "");
  const day = await prisma.crewJobDay.findUnique({
    where: { id: dayId },
    include: { booking: { include: { crew: { select: { id: true, leadPartnerId: true } } } } },
  });
  if (!day || day.booking.crew?.leadPartnerId !== partner.id || !day.rescheduleToDate) return;

  const limitReached = day.booking.rescheduleCount >= 2;
  const roles = parseRoles(day.booking.archetypeDetails);
  const free = await crewCanServeDate(day.booking.crew.id, roles, day.rescheduleToDate, day.booking.id);

  if (limitReached || !free) {
    // Can't honour it — clear the pending request (the customer can pick another date).
    await prisma.crewJobDay.update({ where: { id: dayId }, data: { rescheduleToDate: null } });
    revalidatePath(PATH);
    return;
  }
  await prisma.crewJobDay.update({ where: { id: dayId }, data: { dayDate: day.rescheduleToDate, rescheduleToDate: null } });
  await prisma.booking.update({ where: { id: day.booking.id }, data: { rescheduleCount: { increment: 1 } } });
  revalidatePath(PATH);
}

export async function declineReschedule(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const dayId = String(formData.get("dayId") ?? "");
  const day = await prisma.crewJobDay.findUnique({
    where: { id: dayId },
    include: { booking: { include: { crew: { select: { leadPartnerId: true } } } } },
  });
  if (!day || day.booking.crew?.leadPartnerId !== partner.id) return;
  await prisma.crewJobDay.update({ where: { id: dayId }, data: { rescheduleToDate: null } });
  revalidatePath(PATH);
}

/** Lead assigns a specific member to a job (only assigned members can clock in). */
export async function assignMemberAction(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  await assignMember(partner.id, String(formData.get("bookingId") ?? ""), String(formData.get("memberId") ?? ""));
  revalidatePath(PATH);
}

export async function unassignMemberAction(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  await unassignMember(partner.id, String(formData.get("bookingId") ?? ""), String(formData.get("memberId") ?? ""));
  revalidatePath(PATH);
}

/** Lead requests extra days on an in-progress job (customer approves + pays the extra). */
export async function requestExtension(formData: FormData): Promise<void> {
  const partner = await requirePartner();
  const bookingId = String(formData.get("bookingId") ?? "");
  const extraDays = Math.max(1, Math.min(7, Number(formData.get("extraDays")) || 1));
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { crew: { select: { id: true, leadPartnerId: true } }, crewJobDays: { select: { dayDate: true } } },
  });
  if (!booking || booking.crew?.leadPartnerId !== partner.id || booking.status !== "CREW_WORKING") return;

  const lastDay = [...booking.crewJobDays.map((d) => d.dayDate)].sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  const newDates = bookingDates(lastDay, extraDays + 1).slice(1); // days after the last day
  const roles = parseRoles(booking.archetypeDetails);
  for (const date of newDates) {
    if (!(await crewCanServeDate(booking.crew.id, roles, date, booking.id))) return; // crew not free
  }
  await prisma.booking.update({ where: { id: bookingId }, data: { extensionDays: extraDays } });
  revalidatePath(PATH);
}
