import Link from "next/link";
import { Bell, Briefcase, CheckCircle2 } from "lucide-react";
import { Medallion } from "@/components/graphics";
import { inr } from "@/lib/format";
import { CREW_JOB_STATUS_LABEL, type CrewSummary, type LedgerEntry, type Offer } from "./types";

function CrewRequestBanner({ crew }: { crew: CrewSummary }) {
  if (crew.pendingRequests === 0) return null;
  return (
    <Link
      href="/dashboard/crew/requests"
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4"
    >
      <div>
        <p className="text-sm font-bold text-ink-900">
          {crew.pendingRequests} new crew {crew.pendingRequests === 1 ? "request" : "requests"}
        </p>
        <p className="text-xs text-gray-600">Accept before another crew does →</p>
      </div>
      <Bell className="h-5 w-5 text-brand-600" />
    </Link>
  );
}

function CrewJobsList({ crew }: { crew: CrewSummary }) {
  if (crew.jobs.length === 0) return null;
  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
        Crew jobs · {crew.name}
      </p>
      <div className="space-y-2">
        {crew.jobs.map((j) => (
          <Link
            key={j.bookingRef}
            href="/dashboard/crew/jobs"
            className="flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-white p-3.5 hover:border-brand-400"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-900">{j.service} · Team</p>
              <p className="truncate text-[11px] text-gray-500">
                {j.location} · {j.durationDays} {j.durationDays === 1 ? "day" : "days"} · {j.bookingRef}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
              {CREW_JOB_STATUS_LABEL[j.status] ?? j.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function CrewSection({ crew }: { crew: CrewSummary | null | undefined }) {
  if (!crew) return null;
  return (
    <>
      <CrewRequestBanner crew={crew} />
      <CrewJobsList crew={crew} />
    </>
  );
}

export function ActiveJobCard({ offer }: { offer: Offer }) {
  return (
    <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <span className="flex w-fit items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" /> ACTIVE NOW
      </span>
      <p className="mt-2 text-sm font-bold text-ink-900">{offer.title}</p>
      <p className="text-xs text-gray-600">{offer.drop}</p>
      <p className="mt-1 text-sm font-bold text-brand-700">{inr(offer.fare)}</p>
    </div>
  );
}

export function NoActiveJobCard() {
  return (
    <div className="mb-4 rounded-2xl border border-dashed border-border bg-white p-5 text-center">
      <Medallion icon={Briefcase} tone="slate" size={48} className="mx-auto" />
      <p className="mt-3 text-sm font-semibold text-ink-900">No active job</p>
      <p className="text-xs text-gray-500">Go online from Home to get matched.</p>
    </div>
  );
}

export function JobHistoryList({ ledger }: { ledger: LedgerEntry[] }) {
  if (ledger.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-5 text-center text-sm text-gray-500">
        Your completed jobs will appear here.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {ledger.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-2xl border border-border bg-white p-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-green-50 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">{r.title}</p>
              <p className="text-[11px] text-gray-500">
                {r.ref} · {r.when}
              </p>
            </div>
          </div>
          <p className="text-sm font-bold text-ink-900">{inr(r.amount)}</p>
        </div>
      ))}
    </div>
  );
}
