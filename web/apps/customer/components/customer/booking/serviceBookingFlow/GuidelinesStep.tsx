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
  const sections = [
    {
      title: "What's included",
      items: config.guidelines.included,
      icon: "✓",
      tone: "border-green-100 bg-green-50/60",
      iconTone: "bg-green-100 text-green-700",
    },
    {
      title: "Not included",
      items: config.guidelines.notIncluded,
      icon: "✕",
      tone: "border-red-100 bg-red-50/60",
      iconTone: "bg-red-100 text-red-700",
    },
    {
      title: "Good to know",
      items: config.guidelines.goodToKnow,
      icon: "•",
      tone: "border-blue-100 bg-blue-50/60",
      iconTone: "bg-blue-100 text-blue-700",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-black text-gray-900">{service.name}</h2>
        <p className="mt-1 text-sm text-gray-500">{config.guidelines.summary}</p>
        <p className="mt-2 text-sm font-bold text-gray-900">
          Starts at {formatPrice(startsAtPaise)}
          <span className="ml-1 font-medium text-gray-400">
            · ~{Math.max(1, Math.round(service.duration / 60))} hr
          </span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((sec) => (
          <div key={sec.title} className={`rounded-2xl border p-4 ${sec.tone}`}>
            <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-gray-500">
              {sec.title}
            </p>
            <ul className="space-y-2">
              {sec.items.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${sec.iconTone}`}
                  >
                    {sec.icon}
                  </span>
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-6 w-full rounded-xl bg-[var(--color-brand)] py-3.5 text-base font-bold text-white transition-colors hover:bg-blue-900 sm:w-auto sm:px-10"
      >
        Continue →
      </button>
    </div>
  );
}
