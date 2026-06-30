import "server-only";
import { prisma } from "@vsolve/db";
import { defaultRoleRatePaise } from "./crew-constants";
import { hasAnyAssignment, isAssigned } from "./crew-assign";

/**
 * On-site attendance by OTP. The lead is remote: each assigned partner enters
 * the customer's team Start OTP on their own phone to clock in, and any partner
 * entering the End OTP finishes the current work day. No manual marking.
 */

const ACTIVE_BOOKING_STATUSES = ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"] as const;

function parseRoles(raw: string): { roleId: string; count: number }[] {
  try {
    const d = JSON.parse(raw);
    return Array.isArray(d?.roles) ? d.roles : [];
  } catch {
    return [];
  }
}

function activeDay(bookingId: string) {
  return prisma.crewJobDay.findFirst({
    where: { bookingId, status: { in: ["SCHEDULED", "WORKING"] } },
    orderBy: { dayDate: "asc" },
  });
}

export type MemberWork = NonNullable<Awaited<ReturnType<typeof getMemberWork>>>;

/** The member's identity + their crew's active jobs with this member's clock state. */
export async function getMemberWork(token: string) {
  const member = await prisma.crewMember.findUnique({
    where: { inviteToken: token },
    include: { crew: { select: { id: true, name: true } } },
  });
  if (!member || member.status !== "ACTIVE") return null;

  const bookings = await prisma.booking.findMany({
    where: { crewId: member.crewId, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
    orderBy: { createdAt: "desc" },
    include: {
      service: { select: { name: true } },
      address: { select: { area: true, city: true, fullAddress: true } },
      crewAssignments: { select: { crewMemberId: true } },
      crewJobDays: {
        where: { status: { in: ["SCHEDULED", "WORKING"] } },
        orderBy: { dayDate: "asc" },
        take: 1,
        include: { clockEvents: { where: { crewMemberId: member.id } } },
      },
    },
  });

  return {
    member: { id: member.id, name: member.name, role: member.role },
    crew: member.crew,
    jobs: bookings.map((b) => {
      const day = b.crewJobDays[0];
      const ev = day?.clockEvents[0];
      const clockState = !ev ? "out" : ev.clockOutAt ? "done" : "in";
      const needsAssignment = b.crewAssignments.length > 0;
      return {
        bookingRef: b.bookingRef,
        service: b.service.name,
        location: b.address.area || b.address.city || b.address.fullAddress,
        status: b.status,
        paid: b.paymentStatus === "ESCROW_HELD" || b.paymentStatus === "PAID",
        clockState,
        // If the lead picked specific members, only they can clock in.
        assignedToMe: !needsAssignment || b.crewAssignments.some((a) => a.crewMemberId === member.id),
      };
    }),
  };
}

type ClockResult = { ok: boolean; action?: "in" | "end"; message?: string; error?: string };

/** Member submits the team OTP. Start OTP clocks them in; End OTP finishes the day. */
export async function clockWithOtp(token: string, otp: string): Promise<ClockResult> {
  const member = await prisma.crewMember.findUnique({ where: { inviteToken: token } });
  if (!member || member.status !== "ACTIVE") return { ok: false, error: "This link is no longer valid." };

  const code = otp.trim();
  if (!/^\d{4}$/.test(code)) return { ok: false, error: "Enter the 4-digit code." };

  const bookings = await prisma.booking.findMany({
    where: { crewId: member.crewId, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
  });
  const startBooking = bookings.find((b) => b.startOtp === code);
  const endBooking = bookings.find((b) => b.endOtp === code && b.status === "CREW_WORKING");

  if (startBooking) return clockInMember(member, startBooking);
  if (endBooking) return finishDayViaOtp(endBooking);
  return { ok: false, error: "Wrong code. Please check with the customer." };
}

async function clockInMember(
  member: { id: string; role: string },
  booking: { id: string; paymentStatus: string; startConfirmedAt: Date | null; archetypeDetails: string },
): Promise<ClockResult> {
  if (booking.paymentStatus !== "ESCROW_HELD") {
    return { ok: false, error: "Waiting for the customer to pay before work can start." };
  }
  if (!booking.startConfirmedAt) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { startConfirmedAt: new Date(), status: "CREW_WORKING" },
    });
    await prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "CREW_WORKING" } });
  }

  const day = await activeDay(booking.id);
  if (!day) return { ok: false, error: "No active work day." };

  const booked = parseRoles(booking.archetypeDetails).find((r) => r.roleId === member.role)?.count ?? 0;
  if (booked <= 0) return { ok: false, error: "Your role isn't part of this job." };

  // If the lead picked specific members, only they may clock in.
  if ((await hasAnyAssignment(booking.id)) && !(await isAssigned(booking.id, member.id))) {
    return { ok: false, error: "You're not assigned to this job. Ask your crew lead." };
  }

  const events = await prisma.crewClockEvent.findMany({
    where: { crewJobDayId: day.id },
    include: { member: { select: { role: true } } },
  });
  if (events.some((e) => e.crewMemberId === member.id && !e.clockOutAt)) {
    return { ok: true, action: "in", message: "You're already clocked in." };
  }
  const distinctForRole = new Set(events.filter((e) => e.member.role === member.role).map((e) => e.crewMemberId));
  if (!distinctForRole.has(member.id) && distinctForRole.size >= booked) {
    return { ok: false, error: "All slots for your role are already filled today." };
  }

  await prisma.crewClockEvent.create({ data: { crewJobDayId: day.id, crewMemberId: member.id, source: "OTP" } });
  if (day.status === "SCHEDULED") {
    await prisma.crewJobDay.update({ where: { id: day.id }, data: { status: "WORKING" } });
  }
  return { ok: true, action: "in", message: "Clocked in. Have a great shift!" };
}

async function finishDayViaOtp(booking: {
  id: string;
  crewId: string | null;
  escrowPaise: number;
}): Promise<ClockResult> {
  const day = await activeDay(booking.id);
  if (!day) return { ok: false, error: "No active work day to finish." };

  await prisma.crewClockEvent.updateMany({ where: { crewJobDayId: day.id, clockOutAt: null }, data: { clockOutAt: new Date() } });

  const [events, rates] = await Promise.all([
    prisma.crewClockEvent.findMany({ where: { crewJobDayId: day.id }, include: { member: { select: { id: true, role: true } } } }),
    prisma.crewRoleRate.findMany({ where: { crewId: booking.crewId ?? "" } }),
  ]);
  const rateFor = (role: string) => rates.find((r) => r.role === role)?.dayRatePaise ?? defaultRoleRatePaise(role);
  const present = new Map<string, string>();
  for (const e of events) present.set(e.crewMemberId, e.member.role);
  const earnedPaise = [...present.values()].reduce((s, role) => s + rateFor(role), 0);

  await prisma.crewJobDay.update({ where: { id: day.id }, data: { status: "DAY_DONE", earnedPaise } });

  const remaining = await prisma.crewJobDay.count({
    where: { bookingId: booking.id, status: { in: ["SCHEDULED", "WORKING"] } },
  });
  if (remaining === 0) {
    const doneDays = await prisma.crewJobDay.findMany({
      where: { bookingId: booking.id, status: { in: ["DAY_DONE", "APPROVED"] } },
      select: { earnedPaise: true },
    });
    const finalAmountPaise = doneDays.reduce((s, d) => s + d.earnedPaise, 0);
    const refundedPaise = Math.max(0, booking.escrowPaise - finalAmountPaise);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "COMPLETED", finalAmountPaise, refundedPaise, paymentStatus: "PAID" },
    });
    await prisma.bookingStatusLog.create({ data: { bookingId: booking.id, status: "COMPLETED" } });
    return { ok: true, action: "end", message: "Final day complete — job finished. Thank you!" };
  }
  return { ok: true, action: "end", message: "Day finished. See you next work day!" };
}
