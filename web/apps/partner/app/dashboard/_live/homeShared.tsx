import { Star, type LucideIcon } from "lucide-react";
import type { Props, Stage } from "./types";

export type HomeProps = Props & {
  stage: Stage;
  session: number;
  offerLeft: number;
  tasks: boolean[];
  setTasks: (t: boolean[]) => void;
  otp: string;
  setOtp: (s: string) => void;
  custRating: number;
  setCustRating: (n: number) => void;
  todayEarn: number;
  todayJobs: number;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onArrived: () => void;
  onStartWork: () => void;
  onComplete: () => void;
  onContinue: () => void;
  onRelease: () => void;
  confirmRelease: boolean;
  setConfirmRelease: (v: boolean) => void;
  workError: string;
  busy: boolean;
};

export function ScreenHeader({ name, rating }: { name: string; rating: number }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-[11px] text-gray-500">Welcome back</p>
          <p className="text-sm font-bold text-ink-900">{name}</p>
        </div>
      </div>
      <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink-900 shadow-sm">
        <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" /> {rating.toFixed(1)}
      </span>
    </div>
  );
}

export function CountRing({ left, pct }: { left: number; pct: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-12 w-12">
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#e8e6f0" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={left <= 10 ? "#dc2626" : "#5b50e6"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold text-ink-900">{left}</span>
    </div>
  );
}

export function Pill({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm font-bold text-ink-900">{value}</p>
      </div>
    </div>
  );
}

export function MiniMap({ progress = false }: { progress?: boolean }) {
  return (
    <div className="relative h-44 overflow-hidden rounded-2xl border border-border bg-[#e9eef5]">
      {/* faux roads */}
      <div className="absolute inset-0 opacity-70">
        <div className="absolute left-0 right-0 top-12 h-2 bg-white" />
        <div className="absolute left-0 right-0 bottom-10 h-3 bg-white" />
        <div className="absolute bottom-0 left-16 top-0 w-2 bg-white" />
        <div className="absolute bottom-0 right-20 top-0 w-3 bg-white" />
        <div className="absolute left-24 top-20 h-12 w-16 rounded-sm bg-[#dfe6ef]" />
        <div className="absolute right-10 top-6 h-10 w-12 rounded-sm bg-[#dfe6ef]" />
      </div>
      {/* route */}
      <svg viewBox="0 0 300 176" className="absolute inset-0 h-full w-full">
        <path d="M40 140 C 110 120, 120 60, 200 50" fill="none" stroke="#5b50e6" strokeWidth="4" className={progress ? "vsh-route" : ""} strokeLinecap="round" />
        <circle cx="40" cy="140" r="7" fill="#16a34a" stroke="#fff" strokeWidth="3" />
        <circle cx="200" cy="50" r="9" fill="#5b50e6" stroke="#fff" strokeWidth="3" />
      </svg>
      <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-ink-900 shadow">
        Live route
      </span>
    </div>
  );
}
