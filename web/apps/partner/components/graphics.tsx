import type { LucideIcon } from "lucide-react";
import { cn } from "@vsolve/ui";

/* ------------------------------------------------------------------ *
 * 3D glossy icon "Medallion" — the reusable 3D picture used everywhere.
 * Pure CSS depth (radial gradient sphere + gloss highlight + soft shadow),
 * server-safe, theme-aware, no external assets or id collisions.
 * ------------------------------------------------------------------ */

export type Tone = "brand" | "amber" | "green" | "sky" | "violet" | "rose" | "slate";

const TONES: Record<Tone, { from: string; to: string; shadow: string }> = {
  brand: { from: "#8b7dff", to: "#4f46e5", shadow: "rgba(79,70,229,.45)" },
  amber: { from: "#fcd34d", to: "#d97706", shadow: "rgba(217,119,6,.40)" },
  green: { from: "#4ade80", to: "#059669", shadow: "rgba(5,150,105,.40)" },
  sky: { from: "#38bdf8", to: "#0284c7", shadow: "rgba(2,132,199,.40)" },
  violet: { from: "#c084fc", to: "#7c3aed", shadow: "rgba(124,58,237,.40)" },
  rose: { from: "#fb7185", to: "#e11d48", shadow: "rgba(225,29,72,.40)" },
  slate: { from: "#cbd5e1", to: "#64748b", shadow: "rgba(100,116,139,.35)" },
};

export function Medallion({
  icon: Icon,
  tone = "brand",
  size = 64,
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center rounded-[28%]", className)}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 30% 24%, ${t.from}, ${t.to})`,
        boxShadow: `0 ${size * 0.18}px ${size * 0.3}px -${size * 0.12}px ${t.shadow}, inset 0 2px 5px rgba(255,255,255,.45), inset 0 -${size * 0.1}px ${size * 0.16}px rgba(0,0,0,.18)`,
      }}
    >
      {/* gloss highlight */}
      <span
        className="pointer-events-none absolute rounded-full bg-white/45 blur-[2px]"
        style={{ width: size * 0.34, height: size * 0.22, left: size * 0.2, top: size * 0.14 }}
      />
      <Icon style={{ width: size * 0.44, height: size * 0.44 }} className="relative text-white" strokeWidth={2.2} />
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Infographic stat tile — gradient card, 3D medallion, big value, spark.
 * ------------------------------------------------------------------ */

export function InfoStat({
  icon,
  tone = "brand",
  label,
  value,
  trend,
  spark,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  value: React.ReactNode;
  trend?: string;
  spark?: number[];
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10"
        style={{ background: `radial-gradient(circle, ${TONES[tone].from}, transparent 70%)` }}
      />
      <div className="flex items-start justify-between">
        <Medallion icon={icon} tone={tone} size={44} />
        {trend ? (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-bold text-ink-900">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      {spark && spark.length > 1 ? <Sparkline data={spark} tone={tone} /> : null}
    </div>
  );
}

function Sparkline({ data, tone }: { data: number[]; tone: Tone }) {
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...data);
  const step = w / (data.length - 1);
  const pts = data.map((d, i) => `${i * step},${h - (d / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-7 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={TONES[tone].to} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Step flow — connected 3D nodes (How it works).
 * ------------------------------------------------------------------ */

export function StepFlow({
  steps,
}: {
  steps: { icon: LucideIcon; tone: Tone; title: string; body: string }[];
}) {
  return (
    <div className="relative grid gap-8 md:grid-cols-3">
      <div className="absolute left-[16%] right-[16%] top-9 hidden h-0.5 bg-gradient-to-r from-brand-200 via-brand-300 to-amber-200 md:block" />
      {steps.map((s, i) => (
        <div key={s.title} className="relative flex flex-col items-center text-center">
          <div className="relative">
            <Medallion icon={s.icon} tone={s.tone} size={76} />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">
              {i + 1}
            </span>
          </div>
          <h3 className="mt-4 font-semibold text-ink-900">{s.title}</h3>
          <p className="mt-1 max-w-xs text-sm text-gray-500">{s.body}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Gradient area chart — for earnings trend.
 * ------------------------------------------------------------------ */

export function AreaChart({
  data,
  height = 150,
  tone = "brand",
}: {
  data: { label: string; value: number }[];
  height?: number;
  tone?: Tone;
}) {
  const w = 520;
  const h = height;
  const pad = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
  const x = (i: number) => pad + i * stepX;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${x(data.length - 1)},${h - pad}`;
  const gid = `area-${tone}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Earnings trend">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TONES[tone].from} stopOpacity="0.45" />
          <stop offset="100%" stopColor={TONES[tone].from} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + (h - pad * 2) * g} y2={pad + (h - pad * 2) * g} stroke="#eef0f6" strokeWidth="1" />
      ))}
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={TONES[tone].to} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r="4" fill="#fff" stroke={TONES[tone].to} strokeWidth="2.5" />
          <text x={x(i)} y={h - 6} textAnchor="middle" className="fill-gray-400" style={{ fontSize: 11 }}>
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Illustrated empty state.
 * ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  tone = "slate",
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-border bg-surface-muted/50 px-6 py-14 text-center">
      <Medallion icon={icon} tone={tone} size={68} />
      <p className="mt-4 font-semibold text-ink-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Floating "3D" earnings hero illustration — isometric dashboard card
 * with a mini chart and orbiting medallions.
 * ------------------------------------------------------------------ */

export function EarningsHeroArt({
  icons,
}: {
  icons: { primary: LucideIcon; rupee: LucideIcon; star: LucideIcon; bolt: LucideIcon };
}) {
  const { rupee, star, bolt } = icons;
  return (
    <div className="relative mx-auto h-72 w-72">
      {/* glow */}
      <div className="absolute inset-6 rounded-full bg-brand-500/30 blur-3xl" />
      {/* main floating card */}
      <div className="absolute left-1/2 top-1/2 w-56 -translate-x-1/2 -translate-y-1/2 rotate-[-6deg] rounded-3xl border border-white/40 bg-white/90 p-5 shadow-2xl backdrop-blur">
        <p className="text-xs font-medium text-gray-400">This week</p>
        <p className="text-2xl font-bold text-ink-900">₹ 14,250</p>
        <div className="mt-3 flex h-16 items-end gap-1.5">
          {[40, 62, 48, 78, 56, 90, 70].map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-brand-300 to-brand-600"
              style={{ height: `${v}%` }}
            />
          ))}
        </div>
      </div>
      {/* orbiting 3D medallions */}
      <div className="absolute left-2 top-8 rotate-[8deg]">
        <Medallion icon={rupee} tone="amber" size={64} />
      </div>
      <div className="absolute -right-1 top-20 -rotate-6">
        <Medallion icon={star} tone="green" size={52} />
      </div>
      <div className="absolute bottom-4 left-16">
        <Medallion icon={bolt} tone="violet" size={56} />
      </div>
    </div>
  );
}
