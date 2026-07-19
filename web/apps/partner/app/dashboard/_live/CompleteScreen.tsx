import { Star } from "lucide-react";
import { cn } from "@vsolve/ui";
import { inr } from "@/lib/format";
import type { HomeProps } from "./homeShared";

export function CompleteScreen(p: HomeProps) {
  return (
    <div className="vsh-rise flex h-full flex-col items-center justify-center text-center">
      <div className="relative">
        <span className="vsh-halo absolute inset-0 rounded-full bg-green-400/40 blur-xl" />
        <div className="vsh-pop relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-xl">
          <svg viewBox="0 0 52 52" className="vsh-check h-12 w-12">
            <path fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" d="M14 27 l8 8 l16 -16" />
          </svg>
        </div>
        {[-40, -10, 20, 50].map((tx, i) => (
          <span
            key={i}
            className="vsh-burst absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-accent-400"
            style={{ ["--tx" as string]: `${tx}px`, ["--ty" as string]: `${i % 2 ? -50 : -30}px`, animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      <h2 className="mt-6 text-2xl font-bold text-ink-900">Job Done! 🎉</h2>
      <p className="mt-1 text-sm text-gray-500">Payment has been credited to your wallet.</p>

      <div className="mt-5 w-full rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg">
        <p className="text-xs uppercase tracking-wide text-white/70">You earned</p>
        <p className="text-4xl font-bold">{inr(p.offer.fare)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-left">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-[10px] uppercase text-white/60">Today</p>
            <p className="text-lg font-bold">{inr(p.todayEarn)}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <p className="text-[10px] uppercase text-white/60">Jobs today</p>
            <p className="text-lg font-bold">{p.todayJobs}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 w-full rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-ink-900">Rate {p.offer.customer.name.split(" ")[0]}</p>
        <div className="mt-2 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => p.setCustRating(n)}>
              <Star className={cn("h-8 w-8", n <= p.custRating ? "fill-accent-400 text-accent-400" : "text-gray-300")} />
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={p.onContinue}
        className="mt-5 w-full rounded-xl bg-brand-600 py-3.5 font-bold text-white shadow-lg active:scale-[0.98]"
      >
        Find next job
      </button>
      <button onClick={p.onGoOffline} className="mt-2 text-sm font-medium text-gray-500">
        Go offline
      </button>
    </div>
  );
}
