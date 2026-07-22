import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { FlowService, PriceEstimate, ServiceConfig } from "./types";

export function BookingSummary({
  service,
  startsAtPaise,
  estimate,
}: {
  service: FlowService;
  config: ServiceConfig;
  startsAtPaise: number;
  estimate: PriceEstimate;
}) {
  return (
    <div className="w-full lg:sticky lg:top-6">
      <div className="overflow-hidden rounded-[16px] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.08)]">
        {/* Deep Navy Header Block */}
        <div className="bg-[#0b1c30] p-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            BOOKING SUMMARY
          </p>
          <h2 className="font-heading mt-1 text-lg font-bold text-white">{service.name}</h2>
        </div>

        {/* White Body Panel */}
        <div className="p-6 bg-white">
          {/* Verified Provider Badge Block */}
          <div className="mb-6 flex items-center gap-3.5 rounded-[16px] bg-[#f0f7ff] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#006b5f] shadow-xs">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a2 2 0 01-2 2 2 2 0 01-2-2V4zm-6 8a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4zM4 18a2 2 0 110-4 2 2 0 010 4zm14 0a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-[#0b1c30] text-sm">Verified Technician</div>
              <div className="mt-0.5 text-xs font-medium text-[#45464d] flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>60-90 mins est. duration</span>
              </div>
            </div>
          </div>

          {/* Pricing Line Items */}
          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#45464d]">
                {estimate.lineItems.find((li) => li.kind === "variant")?.value || "Inspection & Diagnosis"}
              </span>
              <strong className="font-bold text-[#0b1c30]">{formatPrice(estimate.basePaise || startsAtPaise)}</strong>
            </div>

            {estimate.lineItems
              .filter((li) => li.kind !== "variant")
              .map((li) => (
                <div className="flex items-center justify-between" key={`${li.key}-${li.value}`}>
                  <span className="font-medium text-[#45464d]">
                    {li.value}
                    {li.qty > 1 && ` × ${li.qty}`}
                  </span>
                  <strong className="font-bold text-[#0b1c30]">+{formatPrice(li.totalPaise)}</strong>
                </div>
              ))}

            <div className="flex items-center justify-between pt-1">
              <span className="font-medium text-[#45464d]">Platform Convenience Fee</span>
              <span className="rounded-md bg-[#e6f4f1] px-2.5 py-0.5 text-[11px] font-bold text-[#006b5f]">
                WAIVED
              </span>
            </div>
          </div>

          <div className="my-5 border-t border-dashed border-slate-200" />

          {/* Total Payable */}
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-[#45464d]">Total Payable</span>
            <div className="text-right">
              <span className="font-heading text-3xl font-extrabold text-[#0b1c30]">
                {formatPrice(estimate.totalPaise || startsAtPaise)}
              </span>
              <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                TAX INCLUSIVE
              </span>
            </div>
          </div>

          {/* Guarantee Box */}
          <div className="my-5 flex items-start gap-3 rounded-[16px] border border-[#b2e5dd] bg-[#e6f4f1]/60 p-3.5 text-xs text-[#004d44]">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#006b5f] text-white text-xs">
              ✓
            </div>
            <div className="font-medium leading-normal">
              <strong className="font-bold">No hidden costs.</strong> Final price will be confirmed by the professional based on your specific requirements.
            </div>
          </div>

          {/* Primary CTA */}
          <button
            type="button"
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#000000] px-6 text-sm font-bold text-white shadow-md transition-all hover:bg-[#0b1c30] active:scale-98 cursor-pointer"
          >
            <span>Confirm and proceed</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Footer Policy Link */}
      <div className="mt-4 text-center text-xs text-[#76777d]">
        By proceeding, you agree to our{" "}
        <Link href="/support" className="font-semibold text-slate-700 underline hover:text-slate-900">
          Booking Policy
        </Link>
      </div>
    </div>
  );
}
