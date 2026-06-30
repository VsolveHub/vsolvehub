import Link from "next/link";
import { Wrench, Radio, PauseCircle, Briefcase, Inbox, MapPin, ChevronRight } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Button } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { getCrewForPartner, inviteUrl, roleLabel, parseEquipment } from "@/lib/crew";
import { SKILL_LEVELS, defaultRoleRatePaise } from "@/lib/crew-constants";
import { PageHeader } from "@/components/dashboard/page-header";
import { CrewSetup } from "./crew-setup";
import { RosterManager, type MemberVM } from "./roster-manager";
import { PricingEditor } from "./pricing-editor";
import { setCrewStatus } from "./actions";

export const metadata = { title: "My Crew" };

const skillLabel = (v: string) => SKILL_LEVELS.find((s) => s.value === v)?.label ?? v;

export default async function CrewPage() {
  const partner = await requirePartner();
  const crew = await getCrewForPartner(partner.id);

  if (!crew) {
    return (
      <div>
        <PageHeader title="My Crew" subtitle="Run a team and take on bigger jobs." />
        <CrewSetup tradeName={partner.trade?.name ?? "My"} />
      </div>
    );
  }

  const members: MemberVM[] = crew.members.map((m) => ({
    id: m.id,
    name: m.name,
    roleLabel: roleLabel(m.role),
    skillLabel: skillLabel(m.skillLevel),
    phone: m.phone,
    status: m.status,
    inviteUrl: inviteUrl(m.inviteToken),
  }));

  const activeCount = members.filter((m) => m.status === "ACTIVE").length;
  const equipment = parseEquipment(crew.equipment);
  const isLive = crew.status === "ACTIVE";

  // Pricing rows: one per distinct active role, prefilled from saved rate or platform default.
  const [savedRates, pendingRequests, activeJobs] = await Promise.all([
    prisma.crewRoleRate.findMany({ where: { crewId: crew.id } }),
    prisma.crewJobOffer.count({ where: { crewId: crew.id, status: "PENDING", expiresAt: { gt: new Date() } } }),
    prisma.booking.findMany({
      where: { crewId: crew.id, status: { in: ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING"] } },
      orderBy: { createdAt: "desc" },
      include: { address: { select: { area: true, city: true, fullAddress: true } }, service: true },
    }),
  ]);
  const jobStatusLabel: Record<string, string> = {
    CREW_ASSIGNED: "Assigned",
    CREW_EN_ROUTE: "On the way",
    CREW_WORKING: "Working",
  };
  const distinctRoles = [...new Set(crew.members.filter((m) => m.status === "ACTIVE").map((m) => m.role))];
  const rateRows = distinctRoles.map((role) => ({
    role,
    rupees: Math.round((savedRates.find((r) => r.role === role)?.dayRatePaise ?? defaultRoleRatePaise(role)) / 100),
  }));

  return (
    <div>
      <PageHeader
        title={crew.name}
        subtitle={`${crew.tradeSlug} crew · ${crew.city}`}
        action={
          <div className="flex gap-2">
            <Link href="/dashboard/crew/requests">
              <Button variant="outline" size="sm" className="relative">
                <Inbox className="h-4 w-4" /> Requests
                {pendingRequests > 0 ? (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
                    {pendingRequests}
                  </span>
                ) : null}
              </Button>
            </Link>
            <Link href="/dashboard/crew/jobs">
              <Button variant="outline" size="sm">
                <Briefcase className="h-4 w-4" /> Jobs
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              isLive ? "bg-green-50 text-green-600" : "bg-surface-muted text-gray-400"
            }`}
          >
            {isLive ? <Radio className="h-5 w-5" /> : <PauseCircle className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-900">{isLive ? "Live — accepting jobs" : "Not live yet"}</p>
            <p className="text-xs text-gray-500">
              {activeCount} of {members.length} {members.length === 1 ? "member" : "members"} joined
            </p>
          </div>
        </div>
        <form action={setCrewStatus}>
          <input type="hidden" name="status" value={isLive ? "DRAFT" : "ACTIVE"} />
          {isLive ? (
            <Button type="submit" variant="outline" size="sm">
              Pause
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={activeCount < 1}>
              Go live
            </Button>
          )}
        </form>
      </div>

      {!isLive && activeCount < 1 ? (
        <p className="mb-5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          At least one member must scan their invite and join before you can go live.
        </p>
      ) : null}

      {pendingRequests > 0 ? (
        <Link
          href="/dashboard/crew/requests"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white">
              <Inbox className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {pendingRequests} new {pendingRequests === 1 ? "request" : "requests"}
              </p>
              <p className="text-xs text-gray-600">Tap to accept before another crew does.</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-brand-600" />
        </Link>
      ) : null}

      {activeJobs.length > 0 ? (
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-900">Active jobs ({activeJobs.length})</p>
            <Link href="/dashboard/crew/jobs" className="text-xs font-semibold text-brand-600">
              Manage all
            </Link>
          </div>
          <div className="space-y-2">
            {activeJobs.map((j) => (
              <Link
                key={j.id}
                href="/dashboard/crew/jobs"
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-3.5 hover:border-brand-300"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {j.service.name} · #{j.bookingRef}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {j.address.area || j.address.city || j.address.fullAddress} · {j.durationDays}{" "}
                    {j.durationDays === 1 ? "day" : "days"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                  {jobStatusLabel[j.status] ?? j.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {equipment.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <Wrench className="h-3.5 w-3.5" />
          {equipment.map((e) => (
            <span key={e} className="rounded-full bg-surface-muted px-2 py-0.5">
              {e}
            </span>
          ))}
        </div>
      ) : null}

      <RosterManager members={members} />

      {rateRows.length > 0 ? (
        <div className="mt-6">
          <PricingEditor rates={rateRows} />
        </div>
      ) : null}
    </div>
  );
}
