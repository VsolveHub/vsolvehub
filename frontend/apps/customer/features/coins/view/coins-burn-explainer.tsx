"use client";

import { Button, formatMoney } from "@vsolve/ui";
import { HelpCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { useCoinBurnPreview, type CustomerCoinsSummary } from "../queries";

interface CoinsBurnExplainerProps {
  summary: CustomerCoinsSummary;
}

export function CoinsBurnExplainer({ summary }: CoinsBurnExplainerProps) {
  const policy = summary.active_burn_policy;
  const [orderAmountRupees, setOrderAmountRupees] = useState<string>("1000");
  const [previewResult, setPreviewResult] = useState<{
    applied_burn_coins: number;
    discount_paise: number;
    remaining_payable_paise: number;
  } | null>(null);

  const burnMutation = useCoinBurnPreview();

  const handleCalculatePreview = (e: React.FormEvent) => {
    e.preventDefault();
    const rupees = parseInt(orderAmountRupees, 10);
    if (isNaN(rupees) || rupees <= 0) return;

    burnMutation.mutate(
      {
        order_payable_paise: rupees * 100,
        requested_coins: summary.spendable_coins,
      },
      {
        onSuccess: (data) => {
          setPreviewResult(data);
        },
      },
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Rules Explainer */}
      <div className="rounded-card border border-[#e7e2da] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#eee9e0] pb-3.5">
          <HelpCircle className="size-4.5 text-[#EA580C]" />
          <h2 className="text-base font-bold text-navy-900">How V Coins Work</h2>
        </div>

        <ol className="mt-4 space-y-3.5 text-xs text-text-secondary leading-relaxed">
          <li className="flex items-start gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-orange-100 text-[11px] font-bold text-[#EA580C]">
              1
            </span>
            <span>
              <strong className="text-navy-900">Earn with every booking:</strong> Earn coins on verified bookings and special seasonal promotions.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-orange-100 text-[11px] font-bold text-[#EA580C]">
              2
            </span>
            <span>
              <strong className="text-navy-900">Locked until completion:</strong> Granted coins become unlocked as soon as your booking is marked completed.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-orange-100 text-[11px] font-bold text-[#EA580C]">
              3
            </span>
            <span>
              <strong className="text-navy-900">Redeem at checkout:</strong>{" "}
              {typeof policy?.coin_value_paise === "number" && typeof policy?.max_burn_percent === "number"
                ? `1 V Coin = ₹${(policy.coin_value_paise / 100).toFixed(2)}. Apply coins for up to ${policy.max_burn_percent}% off a booking total.`
                : "The published burn policy sets the coin value and the maximum share of a bill you can pay with coins."}
            </span>
          </li>
        </ol>
      </div>

      {/* Server-backed Burn Preview Calculator */}
      <div className="rounded-card border border-[#e7e2da] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#eee9e0] pb-3.5">
          <Sparkles className="size-4.5 text-amber-500" />
          <h2 className="text-base font-bold text-navy-900">Checkout Savings Preview</h2>
        </div>

        <form onSubmit={handleCalculatePreview} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="coins-preview-order"
              className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5"
            >
              Enter Sample Booking Total (₹)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-bold text-navy-900">
                ₹
              </span>
              <input
                id="coins-preview-order"
                type="number"
                min="100"
                step="50"
                value={orderAmountRupees}
                onChange={(e) => setOrderAmountRupees(e.target.value)}
                className="w-full rounded-xl border border-[#e7e2da] bg-white py-2 pl-7 pr-3 text-sm font-bold text-navy-900 focus:border-[#EA580C] focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="outline"
            className="w-full text-xs font-semibold h-9"
            disabled={burnMutation.isPending || summary.spendable_coins <= 0}
          >
            {burnMutation.isPending ? "Calculating..." : "Preview My Coin Savings"}
          </Button>

          {previewResult && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-xs">
              <div className="flex items-center justify-between font-semibold text-amber-950">
                <span>Coins applied:</span>
                <span data-numeric className="font-bold">{previewResult.applied_burn_coins.toLocaleString("en-IN")} coins</span>
              </div>
              <div className="flex items-center justify-between text-emerald-700 font-semibold mt-1">
                <span>You save:</span>
                <span data-numeric className="font-bold">-{formatMoney(previewResult.discount_paise)}</span>
              </div>
              <div className="flex items-center justify-between text-navy-900 font-bold border-t border-amber-200/70 pt-2 mt-2">
                <span>Final payable:</span>
                <span data-numeric>{formatMoney(previewResult.remaining_payable_paise)}</span>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
