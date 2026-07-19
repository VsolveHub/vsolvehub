import { useState } from "react";
import { IndianRupee, TrendingUp, Target, Banknote } from "lucide-react";
import { cn } from "@vsolve/ui";
import { AreaChart } from "@/components/graphics";
import { inr } from "@/lib/format";
import { TabTitle } from "./TabTitle";
import { Stat } from "./Stat";
import type { Props } from "./types";

/* ------------------------------------------------------------------ *
 * EARNINGS tab.
 * ------------------------------------------------------------------ */
export function EarningsTab(p: Props & { todayEarn: number; onWithdraw: () => void }) {
  const [range, setRange] = useState<"D" | "W" | "M">("W");
  const goal = 5000;
  const added = p.todayEarn - p.todayEarnings;
  const optimisticWeek = p.weekTotal + added;
  const optimisticBalance = p.allTotal + added;
  const goalPct = Math.min(100, Math.round((optimisticWeek / goal) * 100));

  return (
    <div className="vsh-rise">
      <TabTitle title="Earnings" subtitle="Track your payouts" />

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <p className="text-xs uppercase tracking-wide text-white/70">Available balance</p>
        <p className="text-4xl font-bold">{inr(optimisticBalance)}</p>
        <p className="mt-1 text-xs text-white/60">
          {p.bankLast4 ? `Auto-payout to ····${p.bankLast4}` : "Add a bank account to withdraw"}
        </p>
        <button
          onClick={p.onWithdraw}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-2 text-sm font-bold text-ink-900 active:scale-[0.98]"
        >
          <Banknote className="h-4 w-4" /> Withdraw
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-ink-900">Trend</p>
          <div className="flex gap-1 rounded-lg bg-surface-muted p-0.5">
            {(["D", "W", "M"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  range === r ? "bg-white text-brand-700 shadow-sm" : "text-gray-400",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <AreaChart data={p.week} tone="brand" height={140} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={IndianRupee} tone="amber" label="Today" value={inr(p.todayEarn)} />
        <Stat icon={TrendingUp} tone="green" label="This week" value={inr(optimisticWeek)} />
        <Stat icon={Target} tone="violet" label="Per job" value={inr(p.avgJob)} />
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink-900">Weekly goal</p>
          <span className="text-xs font-semibold text-brand-700">{goalPct}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-400" style={{ width: `${goalPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {inr(optimisticWeek)} of {inr(goal)} · keep going!
        </p>
      </div>

      {p.ledger.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Recent earnings</p>
          <div className="space-y-2">
            {p.ledger.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-white p-3">
                <div>
                  <p className="text-sm font-semibold text-brand-700">{r.ref}</p>
                  <p className="text-[11px] text-gray-500">{r.when}</p>
                </div>
                <span className="text-sm font-bold text-ink-900">{inr(r.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {p.withdrawals.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Withdrawals</p>
          <div className="space-y-2">
            {p.withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-white p-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-muted text-gray-500">
                    <Banknote className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Withdrawn to bank</p>
                    <p className="text-[11px] text-gray-500">{w.ref} · {w.when}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-500">− {inr(w.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
