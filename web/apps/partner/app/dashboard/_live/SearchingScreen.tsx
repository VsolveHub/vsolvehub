import { Search, Star, Wallet, Briefcase } from "lucide-react";
import { inr } from "@/lib/format";
import { Stat } from "./Stat";
import { ScreenHeader, type HomeProps } from "./homeShared";

export function SearchingScreen(p: HomeProps) {
  return (
    <div className="vsh-rise flex h-full flex-col">
      <ScreenHeader name={p.name} rating={p.rating} />

      {/* Radar */}
      <div className="relative mx-auto mt-6 grid h-56 w-56 place-items-center">
        {[0, 0.8, 1.6].map((d) => (
          <span
            key={d}
            className="vsh-ping absolute h-56 w-56 rounded-full border border-brand-300 bg-brand-500/10"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
        <svg viewBox="0 0 100 100" className="vsh-sweep absolute h-56 w-56 opacity-70">
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M50 50 L50 2 A48 48 0 0 1 92 38 Z" fill="url(#sweep)" />
        </svg>
        <div className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl">
          <Search className="h-8 w-8" />
        </div>
      </div>

      <div className="mt-6 text-center">
        <h2 className="text-lg font-bold text-ink-900">Searching for jobs…</h2>
        <p className="text-sm text-gray-500">Hang tight — matching you with nearby requests.</p>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat icon={Star} tone="violet" label="Rating" value={p.rating.toFixed(1)} />
        <Stat icon={Wallet} tone="amber" label="Today" value={inr(p.todayEarn)} />
        <Stat icon={Briefcase} tone="green" label="Jobs" value={p.todayJobs} />
      </div>

      <button
        onClick={p.onGoOffline}
        className="mt-auto w-full rounded-xl border border-border bg-white py-3 text-sm font-semibold text-ink-900 active:scale-[0.98]"
      >
        Go Offline
      </button>
    </div>
  );
}
