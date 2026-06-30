import Link from "next/link";
import { prisma } from "@vsolve/db";
import { requirePartner } from "@/lib/auth";
import { getCrewForPartner, roleLabel } from "@/lib/crew";
import { busyMemberIds } from "@/lib/crew-assign";
import { PageHeader } from "@/components/dashboard/page-header";
import { JobsClient, type JobVM, type RosterMember } from "./jobs-client";

export const metadata = { title: "Crew Jobs" };

function parseRoles(raw: string): { roleId: string; count: number }[] {
  try {
    const d = JSON.parse(raw);
    return Array.isArray(d?.roles) ? d.roles : [];
  } catch {
    return [];
  }
}

export default async function CrewJobsPage() {
  const partner = await requirePartner();
  const crew = await getCrewForPartner(partner.id);

  if (!crew) {
    return (
      <div>
        <PageHeader title="Crew Jobs" subtitle="Jobs booked for your crew appear here." />
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-gray-500">
          Set up your crew first.{" "}
          <Link href="/dashboard/crew" className="font-semibold text-brand-600">
            Go to My Crew
          </Link>
        </p>
      </div>
    );
  }

  const bookings = await prisma.booking.findMany({
    where: { crewId: crew.id, status: { in: ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"] } },
    orderBy: { createdAt: "desc" },
    include: {
      address: { select: { area: true, city: true, fullAddress: true } },
      crewAssignments: { select: { crewMemberId: true } },
      crewJobDays: { orderBy: { dayDate: "asc" }, include: { clockEvents: { include: { member: { select: { id: true, role: true } } } } } },
    },
  });

  const roster: RosterMember[] = crew.members
    .filter((m) => m.status === "ACTIVE")
    .map((m) => ({ id: m.id, name: m.name, role: m.role, roleLabel: roleLabel(m.role) }));

  const jobs: JobVM[] = await Promise.all(
    bookings.map(async (b) => {
      const assignedIds = new Set(b.crewAssignments.map((a) => a.crewMemberId));
      const roles = parseRoles(b.archetypeDetails)
        .filter((r) => r.count > 0)
        .map((r) => ({ roleId: r.roleId, label: roleLabel(r.roleId), count: r.count }));

      // Member picker (only before work starts) — show who can be assigned per role.
      const assignable = b.status === "CREW_ASSIGNED";
      const busy = assignable ? await busyMemberIds(crew.id, b.id) : new Set<string>();
      const assignRoles = assignable
        ? roles.map((r) => ({
            roleId: r.roleId,
            label: r.label,
            count: r.count,
            members: roster
              .filter((m) => m.role === r.roleId)
              .map((m) => ({ id: m.id, name: m.name, assigned: assignedIds.has(m.id), busy: busy.has(m.id) && !assignedIds.has(m.id) })),
          }))
        : [];

      return {
        id: b.id,
        ref: b.bookingRef,
        location: b.address.area || b.address.city || b.address.fullAddress,
        status: b.status,
        startConfirmed: Boolean(b.startConfirmedAt),
        durationDays: b.durationDays,
        amountRupees: Math.round(b.quotedAmount / 100),
        extensionPending: b.extensionDays,
        roles,
        assignable,
        assignRoles,
        days: b.crewJobDays.map((d) => ({
          id: d.id,
          date: d.dayDate,
          status: d.status,
          rescheduleToDate: d.rescheduleToDate,
          attendance: d.clockEvents.map((e) => ({
            memberId: e.crewMemberId,
            role: e.member.role,
            clockInAt: e.clockInAt.toISOString(),
            clockOutAt: e.clockOutAt ? e.clockOutAt.toISOString() : null,
          })),
        })),
      };
    }),
  );

  return (
    <div>
      <PageHeader title="Crew Jobs" subtitle="Your crew clocks in on their own phones — monitor attendance live here." />
      <JobsClient jobs={jobs} roster={roster} />
    </div>
  );
}
