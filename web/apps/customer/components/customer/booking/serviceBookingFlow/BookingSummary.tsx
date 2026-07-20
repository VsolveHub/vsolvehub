import { formatPrice } from "@/lib/format";
import type { FlowService, PriceEstimate, ServiceConfig } from "./types";

export function BookingSummary({
  service,
  config,
  startsAtPaise,
  estimate,
}: {
  service: FlowService;
  config: ServiceConfig;
  startsAtPaise: number;
  estimate: PriceEstimate;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
      <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-brand-accent)]">
        Booking summary
      </p>
      <h2 className="mt-2 text-lg font-black text-gray-900">{service.name}</h2>
      <p className="mt-1 text-sm text-gray-500">
        Starts at <strong className="text-gray-900">{formatPrice(startsAtPaise)}</strong>
      </p>
      <p className="mt-3 text-sm leading-relaxed text-gray-500">{config.guidelines.summary}</p>

      {service.duration > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--color-brand-light)] px-3 py-1 text-xs font-bold text-[var(--color-brand)]">
            ⏱ ~{Math.max(1, Math.round(service.duration / 60))} hr
          </span>
        </div>
      )}

      <div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Base</span>
          <strong className="text-gray-900">{formatPrice(estimate.basePaise)}</strong>
        </div>
        {estimate.lineItems
          .filter((li) => li.kind !== "variant")
          .map((li) => (
            <div className="flex items-center justify-between" key={`${li.key}-${li.value}`}>
              <span className="text-gray-500">
                {li.value}
                {li.qty > 1 && ` × ${li.qty}`}
              </span>
              <strong className="text-gray-900">+{formatPrice(li.totalPaise)}</strong>
            </div>
          ))}
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Platform fee</span>
          <strong className="text-green-600">FREE</strong>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-base">
          <span className="font-bold text-gray-900">Estimated total</span>
          <strong className="text-gray-900">{formatPrice(estimate.totalPaise)}</strong>
        </div>
        <p className="text-xs text-gray-400">
          Final price is confirmed from your selected requirements.
        </p>
      </div>
    </div>
  );
}
