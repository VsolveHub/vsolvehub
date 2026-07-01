import Link from "next/link";
import { MapPin, Calendar, Users, Check, X } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Button } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { getCrewForPartner, roleLabel } from "@/lib/crew";
import { PageHeader } from "@/components/dashboard/page-header";
import { acceptCrewOffer, declineCrewOffer } from "./actions";

export const metadata = { title: "Crew Requests" };

function parseRoles(raw: string): { roleId: string; count: number }[] {
  try {
    const d = JSON.parse(raw);
    return Array.isArray(d?.roles) ? d.roles : [];
  } catch {
    return [];
  }
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default async function CrewRequestsPage() {
  const partner = await requirePartner();
  const crew = await getCrewForPartner(partner.id);

  if (!crew) {
    return (
      <div>
        <PageHeader title="Crew Requests" subtitle="Incoming team requests appear here." />
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-gray-500">
          Set up your crew first.{" "}
          <Link href="/dashboard/crew" className="font-semibold text-brand-600">
            Go to My Crew
          </Link>
        </p>
      </div>
    );
  }

  const offers = await prisma.crewJobOffer.findMany({
    where: { crewId: crew.id, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { offeredAt: "desc" },
    include: { booking: { include: { address: { select: { area: true, city: true, fullAddress: true } }, service: true } } },
  });

  return (
    <div>
      <PageHeader title="Crew Requests" subtitle="Accept a request to win the job. First crew to accept gets it." />
      {offers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-gray-500">
          No open requests right now. Auto-assign requests from customers show up here.
        </p>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => {
            const roles = parseRoles(o.booking.archetypeDetails);
            const start = (() => {
              try {
                return JSON.parse(o.booking.archetypeDetails).startDate as string;
              } catch {
                return undefined;
              }
            })();
            const loc = o.booking.address.area || o.booking.address.city || o.booking.address.fullAddress;
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-ink-900">{o.booking.service.name} · Team</p>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">New</span>
                </div>
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {loc}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {fmtDate(start)} · {o.booking.durationDays} {o.booking.durationDays === 1 ? "day" : "days"}</span>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-gray-400" />
                  {roles.filter((r) => r.count > 0).map((r) => (
                    <span key={r.roleId} className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-900">
                      {roleLabel(r.roleId)} × {r.count}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <form action={acceptCrewOffer} className="flex-1">
                    <input type="hidden" name="offerId" value={o.id} />
                    <Button type="submit" size="sm" className="w-full">
                      <Check className="h-4 w-4" /> Accept job
                    </Button>
                  </form>
                  <form action={declineCrewOffer}>
                    <input type="hidden" name="offerId" value={o.id} />
                    <Button type="submit" variant="outline" size="sm">
                      <X className="h-4 w-4" /> Decline
                    </Button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
