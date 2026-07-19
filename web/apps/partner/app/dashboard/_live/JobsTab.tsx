import Link from "next/link";
import { Bell, Briefcase, CheckCircle2 } from "lucide-react";
import { Medallion } from "@/components/graphics";
import { inr } from "@/lib/format";
import { TabTitle } from "./TabTitle";
import { CREW_JOB_STATUS_LABEL, type Props, type Stage } from "./types";

/* ------------------------------------------------------------------ *
 * JOBS tab.
 * ------------------------------------------------------------------ */
export function JobsTab(p: Props & { stage: Stage; todayJobs: number }) {
  const active = p.stage !== "offline" && p.stage !== "searching" && p.stage !== "complete";
  return (
    <div className="vsh-rise">
      <TabTitle title="My Jobs" subtitle={`${p.jobsCompleted} completed all-time`} />

      {p.crew && p.crew.pendingRequests > 0 ? (
        <Link
          href="/dashboard/crew/requests"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4"
        >
          <div>
            <p className="text-sm font-bold text-ink-900">
              {p.crew.pendingRequests} new crew {p.crew.pendingRequests === 1 ? "request" : "requests"}
            </p>
            <p className="text-xs text-gray-600">Accept before another crew does →</p>
          </div>
          <Bell className="h-5 w-5 text-brand-600" />
        </Link>
      ) : null}

      {p.crew && p.crew.jobs.length > 0 ? (
        <div className="mb-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
            Crew jobs · {p.crew.name}
          </p>
          <div className="space-y-2">
            {p.crew.jobs.map((j) => (
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
      ) : null}

      {active ? (
        <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" /> ACTIVE NOW
          </span>
          <p className="mt-2 text-sm font-bold text-ink-900">{p.offer.title}</p>
          <p className="text-xs text-gray-600">{p.offer.drop}</p>
          <p className="mt-1 text-sm font-bold text-brand-700">{inr(p.offer.fare)}</p>
        </div>
      ) : !p.crew?.jobs?.length ? (
        <div className="mb-4 rounded-2xl border border-dashed border-border bg-white p-5 text-center">
          <Medallion icon={Briefcase} tone="slate" size={48} className="mx-auto" />
          <p className="mt-3 text-sm font-semibold text-ink-900">No active job</p>
          <p className="text-xs text-gray-500">Go online from Home to get matched.</p>
        </div>
      ) : null}

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">History</p>
      {p.ledger.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-5 text-center text-sm text-gray-500">
          Your completed jobs will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {p.ledger.map((r) => (
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
      )}
    </div>
  );
}
