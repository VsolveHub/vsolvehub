"use client";

import { Badge, formatMoney } from "@vsolve/ui";
import { Award, CheckCircle, ChevronRight } from "lucide-react";
import type { CustomerReferralSummary } from "../queries";

interface ReferralTiersStepperProps {
  summary: CustomerReferralSummary;
}

export function ReferralTiersStepper({ summary }: ReferralTiersStepperProps) {
  const tiers = summary.active_program?.tiers || [];
  const currentCount = summary.successful_referral_count;

  if (tiers.length === 0) return null;

  return (
    <div className="rounded-card border border-[#e7e2da] bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-center justify-between border-b border-[#eee9e0] pb-4">
        <div className="flex items-center gap-2">
          <Award className="size-5 text-[#EA580C]" />
          <h2 className="text-base font-bold text-navy-900">Milestone Reward Tiers</h2>
        </div>
        <span className="text-xs text-text-muted">
          Current: <strong className="text-navy-900">{currentCount} completed referrals</strong>
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier, idx) => {
          const minCount = tier.min_qualified_referrals ?? (idx + 1);
          const isReached = currentCount >= minCount;
          const referrerRewardPaise = tier.referrer_wallet_paise ?? 0;
          const referrerCoins = tier.referrer_coins_amount ?? 0;

          return (
            <div
              key={idx}
              className={`relative rounded-xl border p-4.5 transition-all ${
                isReached
                  ? "border-emerald-300 bg-emerald-50/40 shadow-xs"
                  : "border-[#e7e2da] bg-[#FAF9F7]/70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Tier {idx + 1}
                </span>
                {isReached ? (
                  <Badge tone="success" className="text-[10px] py-0">
                    <CheckCircle className="size-3 mr-1" />
                    Unlocked
                  </Badge>
                ) : (
                  <Badge tone="neutral" className="text-[10px] py-0">
                    At {minCount}+ Friends
                  </Badge>
                )}
              </div>

              <div className="mt-3">
                {referrerRewardPaise > 0 ? (
                  <p>
                    <span data-numeric className="text-xl font-extrabold text-navy-900">
                      {formatMoney(referrerRewardPaise)}
                    </span>
                    <span className="text-xs text-text-secondary ml-1 font-medium">wallet per friend</span>
                  </p>
                ) : null}
                {referrerCoins > 0 ? (
                  <p className={referrerRewardPaise > 0 ? "mt-1 text-sm font-semibold text-navy-900" : ""}>
                    <span data-numeric className="text-xl font-extrabold text-navy-900">
                      {referrerCoins}
                    </span>
                    <span className="text-xs text-text-secondary ml-1 font-medium">V Coins per friend</span>
                  </p>
                ) : null}
              </div>

              <p className="mt-2 text-[11px] text-text-secondary leading-tight">
                Applies once you reach {minCount} successfully verified friends.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
