import Link from "next/link";
import { Power, Bell, Wallet, Briefcase, Star, IndianRupee, TrendingUp } from "lucide-react";
import { Medallion } from "@/components/graphics";
import { inr } from "@/lib/format";
import { Stat } from "./Stat";
import { ScreenHeader, type HomeProps } from "./homeShared";

export function OfflineScreen(p: HomeProps) {
  return (
    <div className="vsh-rise">
      <ScreenHeader name={p.name} rating={p.rating} />

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-center text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/15">
          <Power className="h-9 w-9" />
        </div>
        <h2 className="mt-4 text-xl font-bold">You&apos;re Offline</h2>
        <p className="mx-auto mt-1 max-w-[15rem] text-sm text-white/75">
          Go online to start receiving jobs near you in {p.city}.
        </p>
        <button
          onClick={p.onGoOnline}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 py-3.5 font-bold text-ink-900 shadow-lg transition active:scale-[0.98]"
        >
          <Power className="h-5 w-5" /> Go Online
        </button>
      </div>

      {p.crew && (p.crew.jobs.length > 0 || p.crew.pendingRequests > 0) ? (
        <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-900">Your crew · {p.crew.name}</p>
            <Link href="/dashboard/crew/jobs" className="text-xs font-semibold text-brand-700">
              Open
            </Link>
          </div>
          {p.crew.pendingRequests > 0 ? (
            <Link
              href="/dashboard/crew/requests"
              className="mt-2 flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700"
            >
              <Bell className="h-3.5 w-3.5" /> {p.crew.pendingRequests} new request
              {p.crew.pendingRequests === 1 ? "" : "s"} — tap to accept
            </Link>
          ) : null}
          {p.crew.jobs.length > 0 ? (
            <p className="mt-2 text-xs text-gray-600">
              {p.crew.jobs.length} active crew {p.crew.jobs.length === 1 ? "job" : "jobs"} — tap Open to manage attendance.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-gray-400">Your summary</p>
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Wallet} tone="amber" label="Earnings" value={inr(p.lifetimeEarnings)} />
        <Stat icon={Briefcase} tone="brand" label="Jobs done" value={p.jobsCompleted} />
        <Stat icon={Star} tone="green" label="Rating" value={p.rating.toFixed(1)} />
        <Stat icon={IndianRupee} tone="violet" label="Avg / day" value={inr(p.avgPerDay)} />
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <Medallion icon={TrendingUp} tone="amber" size={36} />
        <div>
          <p className="text-sm font-bold text-ink-900">High demand near you</p>
          <p className="text-xs text-gray-600">Earn up to {p.offer.surge}× surge in {p.offer.area} right now.</p>
        </div>
      </div>
    </div>
  );
}
