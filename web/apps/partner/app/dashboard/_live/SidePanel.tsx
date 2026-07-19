import { Zap, Wallet, Briefcase, Star, CheckCircle2 } from "lucide-react";
import { inr } from "@/lib/format";
import { Stat } from "./Stat";
import type { Props } from "./types";

/* ------------------------------------------------------------------ *
 * Desktop side panel — gives the page proper layout beyond the phone.
 * ------------------------------------------------------------------ */
export function SidePanel({ name, city, rating, jobsCompleted, weekTotal, gate }: Props & { gate: boolean }) {
  return (
    <div className="hidden max-w-md flex-1 lg:block">
      <p className="flex items-center gap-2 text-sm font-semibold text-accent-400">
        <Zap className="h-4 w-4" /> CAPTAIN APP
      </p>
      <h1 className="mt-3 text-4xl font-bold leading-tight">
        {gate ? (
          <>Welcome, <span className="text-accent-400">{name}</span>.</>
        ) : (
          <>Your day, <span className="text-accent-400">earning</span> in real time.</>
        )}
      </h1>
      <p className="mt-4 text-white/70">
        {gate
          ? `This is your V Solve Hub Captain home. Once you're verified, you'll go online and start receiving jobs across ${city} right here.`
          : `Go online, get matched to nearby jobs, navigate, complete the checklist and get paid — all from one app. This is exactly what you see on your phone.`}
      </p>

      {!gate && (
        <div className="mt-8 grid grid-cols-3 gap-3">
          <Stat variant="panel" icon={Wallet} tone="amber" label="This week" value={inr(weekTotal)} />
          <Stat variant="panel" icon={Briefcase} tone="brand" label="Jobs done" value={jobsCompleted} />
          <Stat variant="panel" icon={Star} tone="green" label="Rating" value={rating.toFixed(1)} />
        </div>
      )}

      <ul className="mt-8 space-y-3 text-sm text-white/80">
        {[
          ["Smart dispatch", "Jobs matched by distance, skill & demand"],
          ["Transparent fares", "See fare, surge & travel before you accept"],
          ["Guided on-site flow", "OTP start, photo proof & task checklist"],
        ].map(([t, b]) => (
          <li key={t} className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" />
            <span>
              <span className="font-semibold text-white">{t}.</span> {b}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-xs text-white/40">Serving {city} · Best on mobile</p>
    </div>
  );
}
