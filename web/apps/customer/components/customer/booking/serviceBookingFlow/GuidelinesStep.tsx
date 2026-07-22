import { formatPrice } from "@/lib/format";
import type { FlowService, ServiceConfig } from "./types";

export function GuidelinesStep({
  service,
  config,
  startsAtPaise,
  onContinue,
}: {
  service: FlowService;
  config: ServiceConfig;
  startsAtPaise: number;
  onContinue: () => void;
}) {
  const durationHrs = Math.max(1, Math.round(service.duration / 60));

  const sections = [
    {
      title: "WHAT'S INCLUDED",
      items: config.guidelines.included,
      bg: "bg-[#f0fdf4] border-emerald-100/60",
      badgeBg: "bg-emerald-100 text-emerald-600",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    {
      title: "NOT INCLUDED",
      items: config.guidelines.notIncluded,
      bg: "bg-[#fff1f2] border-rose-100/60",
      badgeBg: "bg-rose-100 text-rose-500",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
    {
      title: "GOOD TO KNOW",
      items: config.guidelines.goodToKnow,
      bg: "bg-[#f0f9ff] border-sky-100/60",
      badgeBg: "bg-sky-100 text-sky-600",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{service.name}</h2>
        <p className="mt-1.5 text-sm text-gray-500 max-w-2xl leading-relaxed">{config.guidelines.summary}</p>
        
        <div className="mt-4 flex items-center gap-8 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">STARTS AT</span>
            <span className="text-base font-extrabold text-gray-900 mt-0.5 block">{formatPrice(startsAtPaise)}</span>
          </div>
          <div className="h-7 w-[1px] bg-gray-200" />
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">DURATION</span>
            <span className="text-xs font-semibold text-gray-600 mt-1 block">~{durationHrs} {durationHrs === 1 ? "hr" : "hrs"}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 w-full">
        {sections.map((sec) => (
          <div key={sec.title} className={`rounded-[16px] border p-5 sm:p-6 ${sec.bg}`}>
            <div className={`mb-3.5 flex h-7 w-7 items-center justify-center rounded-full ${sec.badgeBg}`}>
              {sec.icon}
            </div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {sec.title}
            </p>
            <ul className="space-y-2.5">
              {sec.items.slice(0, 3).map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-gray-600 font-medium">
                  <span className="text-gray-400 font-bold select-none">•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#0f172a] px-8 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 active:scale-95"
      >
        <span>Continue</span>
        <span>→</span>
      </button>
    </div>
  );
}
