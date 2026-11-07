"use client";

import { formatDate, formatMoney } from "@vsolve/ui";
import { AlertCircle, Coins as CoinsIcon, Lock, Sparkles } from "lucide-react";
import type { CustomerCoinsSummary } from "../queries";

interface CoinsBucketsCardProps {
  summary: CustomerCoinsSummary;
}

export function CoinsBucketsCard({ summary }: CoinsBucketsCardProps) {
  const policy = summary.active_burn_policy;
  const coinValuePaise = policy?.coin_value_paise;
  const maxBurnPercent = policy?.max_burn_percent;
  const spendableRupeeValuePaise =
    typeof coinValuePaise === "number" ? summary.spendable_coins * coinValuePaise : null;

  return (
    <div className="rounded-card border border-[#e7e2da] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Spendable Hero */}
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <CoinsIcon className="size-5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Spendable V Coins
            </span>
          </div>

          <div className="mt-3 flex items-baseline gap-2.5">
            <span
              data-numeric
              className="text-3xl font-extrabold tracking-tight text-navy-900 md:text-4xl"
            >
              {summary.spendable_coins.toLocaleString("en-IN")}
            </span>
            {spendableRupeeValuePaise != null ? (
              <span className="text-sm font-semibold text-emerald-700">
                ≈ {formatMoney(spendableRupeeValuePaise)} discount
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-text-secondary">
            {typeof maxBurnPercent === "number"
              ? `Apply at checkout for up to ${maxBurnPercent}% off your service bill.`
              : "Apply at checkout. The live burn policy sets the discount cap."}
          </p>
        </div>

        {/* Bucket stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto">
          {/* Pending (waiting period) Bucket */}
          <div className="flex items-start gap-3 rounded-xl border border-[#eee9e0] bg-[#FAF9F7] p-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-100/70 text-amber-700">
              <Sparkles className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span data-numeric className="text-base font-bold text-navy-900">
                  {summary.pending_coins.toLocaleString("en-IN")}
                </span>
                <span className="text-xs font-medium text-text-muted">Pending</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-tight text-text-secondary">
                {summary.next_pending_available_at
                  ? `Earned from a completed booking. Next coins usable on ${formatDate(summary.next_pending_available_at)}.`
                  : "Coins from a completed booking become usable after a short waiting period."}
              </p>
            </div>
          </div>
          {/* Locked / Promised Bucket */}
          <div className="flex items-start gap-3 rounded-xl border border-[#eee9e0] bg-[#FAF9F7] p-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-orange-100/70 text-[#EA580C]">
              <Lock className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span data-numeric className="text-base font-bold text-navy-900">
                  {summary.locked_coins.toLocaleString("en-IN")}
                </span>
                <span className="text-xs font-medium text-text-muted">Locked</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-tight text-text-secondary">
                Welcome or campaign coins. They unlock when you complete a booking.
              </p>
            </div>
          </div>

          {/* Expiring Soon Bucket */}
          <div className="flex items-start gap-3 rounded-xl border border-[#eee9e0] bg-[#FAF9F7] p-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-100/70 text-amber-700">
              <AlertCircle className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span data-numeric className="text-base font-bold text-navy-900">
                  {summary.expiring_soon_coins.toLocaleString("en-IN")}
                </span>
                <span className="text-xs font-medium text-text-muted">Expiring Soon</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-tight text-text-secondary">
                Expires within the next 30 days if unused at checkout.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
