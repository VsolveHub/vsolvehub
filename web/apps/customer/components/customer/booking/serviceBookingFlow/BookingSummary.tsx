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
  const durationHr = Math.max(1, Math.round(service.duration / 60));

  return (
    <div className="overflow-hidden rounded-2xl shadow-lg lg:sticky lg:top-4">
      {/* Dark header */}
      <div className="bg-gray-900 px-6 py-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Booking Summary
        </p>
        <h2 className="mt-2 text-xl font-black text-white">{service.name}</h2>
        {service.duration > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-gray-400">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-medium">Estimated duration: {durationHr} hour</span>
          </div>
        )}
      </div>

      {/* Price breakdown */}
      <div className="bg-white px-6 py-5">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Base Service</span>
            <span className="font-semibold text-gray-900">{formatPrice(estimate.basePaise)}</span>
          </div>
          {estimate.lineItems
            .filter((li) => li.kind !== "variant")
            .map((li) => (
              <div className="flex items-center justify-between" key={`${li.key}-${li.value}`}>
                <span className="text-gray-500">
                  {li.value}
                  {li.qty > 1 && ` × ${li.qty}`}
                </span>
                <span className="font-semibold text-gray-900">+{formatPrice(li.totalPaise)}</span>
              </div>
            ))}
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Platform fee</span>
            <span className="font-bold text-green-500">FREE</span>
          </div>
        </div>

        {/* Total */}
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Total Payable
          </p>
          <div className="mt-1 flex items-end justify-between">
            <span className="text-3xl font-black text-gray-900">
              {formatPrice(estimate.totalPaise)}
            </span>
            <span className="mb-1 text-xs text-gray-400">Price confirmed after{"\n"}scope selection</span>
          </div>
        </div>

        {/* Premium Guarantee */}
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2L3 4.5v4c0 2.8 2.1 5.4 5 6 2.9-.6 5-3.2 5-6v-4L8 2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M6 8l1.5 1.5L10 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-900">Premium Guarantee</p>
            <p className="text-[11px] text-gray-500">100% satisfaction or full refund.</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-white px-6 py-3">
        <p className="text-center text-xs text-gray-400">
          Need help with your booking?{" "}
          <a href="/support" className="font-semibold text-[var(--color-brand)] hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
