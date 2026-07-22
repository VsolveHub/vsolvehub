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
  const durationHr = Math.max(1, Math.round(service.duration / 60));

  const sections = [
    {
      title: "What's Included",
      items: config.guidelines.included,
      colorClass: "text-emerald-600",
      bgClass: "bg-emerald-50",
      borderClass: "border-emerald-100",
      iconBg: "bg-emerald-100",
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3.75 9l3.75 3.75 6.75-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      bulletColor: "bg-emerald-500",
    },
    {
      title: "Not Included",
      items: config.guidelines.notIncluded,
      colorClass: "text-rose-600",
      bgClass: "bg-rose-50",
      borderClass: "border-rose-100",
      iconBg: "bg-rose-100",
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
          <path d="M9 5.5v4M9 11.5v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      bulletColor: "bg-rose-500",
    },
    {
      title: "Good to Know",
      items: config.guidelines.goodToKnow,
      colorClass: "text-blue-600",
      bgClass: "bg-blue-50",
      borderClass: "border-blue-100",
      iconBg: "bg-blue-100",
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
          <path d="M9 8v5M9 6v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      bulletColor: "bg-blue-500",
    },
  ];

  return (
    <div>
      {/* Service title block */}
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-gray-900">{service.name}</h2>
        <p className="mt-2 text-base leading-relaxed text-gray-500">{config.guidelines.summary}</p>
        <div className="mt-5 flex items-center gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Starts at</p>
            <p className="mt-0.5 text-2xl font-black text-gray-900">{formatPrice(startsAtPaise)}</p>
          </div>
          {service.duration > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Duration</p>
              <div className="mt-0.5 flex items-center gap-1.5 text-gray-700">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span className="text-sm font-semibold">~{durationHr} hr</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((sec) => (
          <div
            key={sec.title}
            className={`rounded-2xl border p-5 ${sec.bgClass} ${sec.borderClass}`}
          >
            {/* Icon circle */}
            <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-full ${sec.iconBg} ${sec.colorClass}`}>
              {sec.icon}
            </div>
            <p className={`mb-3 text-[11px] font-black uppercase tracking-widest ${sec.colorClass}`}>
              {sec.title}
            </p>
            <ul className="space-y-2.5">
              {sec.items.map((it, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-700">
                  <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${sec.bulletColor}`} />
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Continue button */}
      <button
        type="button"
        onClick={onContinue}
        className="mt-8 flex items-center gap-2 rounded-xl bg-gray-900 px-8 py-3.5 text-base font-bold text-white transition-all hover:bg-gray-800 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
      >
        Continue
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
