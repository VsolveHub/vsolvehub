"use client";

import { Badge, formatMoney } from "@vsolve/ui";
import { AlertCircle, Coins as CoinsIcon, Lock, Sparkles } from "lucide-react";
import type { CustomerCoinsSummary } from "../queries";

interface CoinsBucketsCardProps {
  summary: CustomerCoinsSummary;
}

export function CoinsBucketsCard({ summary }: CoinsBucketsCardProps) {
  const policy = summary.active_burn_policy;
  const coinValuePaise = policy.coin_value_paise ?? 10;
  const spendableRupeeValuePaise = summary.spendable_coins * coinValuePaise;

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
            <span className="text-sm font-semibold text-emerald-700">
              ≈ {formatMoney(spendableRupeeValuePaise)} discount
            </span>
          </div>
          <p className="mt-1.5 text-xs text-text-secondary">
            Apply at checkout for up to {policy.max_burn_percent}% off your service bill.
          </p>
        </div>

        {/* Bucket stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto">
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
                Unlocks automatically when you complete a verified booking.
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
