"use client";

import { Gift } from "lucide-react";

import { welcomeRewardLine } from "../model";
import { useCustomerReferral } from "../queries";

/**
 * For a customer who joined with a friend's code: their own reward, until it lands.
 *
 * Shown on the referral, wallet and V Coins screens, because those are where somebody looks for
 * money they were promised. Renders nothing once the reward is paid or when there is none.
 */
export function WelcomeRewardBanner() {
  const referral = useCustomerReferral();
  const line = welcomeRewardLine(referral.data?.welcome_reward);
  if (!line) return null;
  const booked = referral.data?.welcome_reward?.status === "QUALIFIED";
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border border-orange-200 bg-orange-50 p-4 text-sm text-navy-900"
    >
      <Gift className="mt-0.5 size-5 shrink-0 text-[#EA580C]" aria-hidden />
      <div>
        <p className="font-semibold">{line}</p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {booked
            ? "It is held for a few days after your booking, in case it is cancelled."
            : "You joined with a friend's code. Your friend is rewarded at the same time."}
        </p>
      </div>
    </div>
  );
}
