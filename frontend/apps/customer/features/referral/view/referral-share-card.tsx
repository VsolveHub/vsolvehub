"use client";

import { Button } from "@vsolve/ui";
import { Check, Copy, Gift, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";
import { rewardLabel } from "../model";
import type { CustomerReferralSummary } from "../queries";

interface ReferralShareCardProps {
  summary: CustomerReferralSummary;
}

export function ReferralShareCard({ summary }: ReferralShareCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary.share_url || summary.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: clipboard access denied (e.g. non-secure context)
    }
  };

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(summary.share_message)}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleShare = async () => {
    try {
      await navigator.share({ text: summary.share_message, url: summary.share_url });
    } catch {
      // Dismissed or unsupported; the copy and WhatsApp buttons remain.
    }
  };

  const program = summary.active_program;
  const refereeLabel = rewardLabel(
    program?.referee_wallet_paise ?? 0,
    program?.referee_coins_amount ?? 0,
  );
  const topTier = program?.tiers?.at(-1);
  const referrerLabel = rewardLabel(
    topTier?.referrer_wallet_paise ?? 0,
    topTier?.referrer_coins_amount ?? 0,
  );
  const headlineCopy =
    refereeLabel && referrerLabel
      ? `Give ${refereeLabel}, get up to ${referrerLabel}`
      : refereeLabel || referrerLabel
        ? `Invite friends and earn ${refereeLabel || referrerLabel}`
        : "Invite friends. Rewards show here when a program is published.";
  const rewardSentence =
    refereeLabel || referrerLabel
      ? "Rewards are added a few days after your friend's first booking is completed."
      : "Share your code. A published program decides whether the reward is wallet balance, V Coins, or both.";

  return (
    <div className="relative overflow-hidden rounded-card border border-[#e7e2da] bg-white p-6 shadow-sm md:p-8">
      {/* Background highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-orange-500/5 blur-2xl"
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-orange-50 text-[#EA580C]">
              <Gift className="size-5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Invite Friends &amp; Earn
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-navy-900 md:text-3xl">
            {headlineCopy}
          </h2>
          <p className="mt-1.5 max-w-prose text-xs text-text-secondary leading-relaxed">
            {rewardSentence} A code applies only when a new customer signs up — it cannot be
            attached later.
          </p>

          {/* Share code box */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-xl border border-dashed border-[#EA580C]/40 bg-orange-50/40 px-3.5 py-2">
              <span className="text-xs font-medium text-text-muted mr-2">Your Code:</span>
              <span className="font-mono text-base font-extrabold tracking-wider text-[#EA580C]">
                {summary.code}
              </span>
            </div>

            <Button
              variant="outline"
              className="h-10 text-xs font-semibold px-4"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="size-4 text-emerald-600 mr-1.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-1.5" />
                  Copy Link
                </>
              )}
            </Button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
            >
              <MessageCircle className="size-4" />
              Share on WhatsApp
            </a>

            {canNativeShare ? (
              <Button
                variant="outline"
                className="h-10 text-xs font-semibold px-4"
                onClick={() => void handleShare()}
              >
                <Share2 className="size-4 mr-1.5" />
                Share
              </Button>
            ) : null}
          </div>
        </div>

        {/* Referral stats */}
        <ReferralStats summary={summary} />
      </div>
    </div>
  );
}


function ReferralStats({ summary }: ReferralShareCardProps) {
  const earned = rewardLabel(summary.total_earned_paise, summary.total_earned_coins) || "0 V Coins";
  const onTheWay = rewardLabel(summary.on_the_way_paise, summary.on_the_way_coins);
  const rows: Array<[string, number]> = [
    ["Friends invited", summary.invited_count],
    ["Successful referrals", summary.successful_referral_count],
    ["Reward on the way", summary.reward_on_the_way_count],
    ["Waiting for first booking", summary.waiting_booking_count],
  ];
  const nextTierCopy =
    summary.next_tier_min != null && summary.referrals_to_next_tier != null
      ? `${summary.referrals_to_next_tier} more successful referral${
          summary.referrals_to_next_tier === 1 ? "" : "s"
        } to reach the next tier`
      : "You are on the top tier";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#eee9e0] bg-[#FAF9F7] p-5 lg:min-w-[260px]">
      <div>
        <span className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Rewards earned
        </span>
        <span
          data-numeric
          className="mt-1 block text-2xl font-extrabold tabular-nums text-emerald-700"
        >
          {earned}
        </span>
        {onTheWay ? (
          <span className="mt-1 block text-xs font-semibold text-navy-900">
            On the way: <span data-numeric>{onTheWay}</span>
          </span>
        ) : null}
      </div>

      <dl className="space-y-1.5 border-t border-[#eee9e0] pt-2.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <dt className="text-text-secondary">{label}</dt>
            <dd data-numeric className="font-bold text-navy-900">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="border-t border-[#eee9e0] pt-2.5 text-[11px] text-text-secondary">
        {summary.current_tier_min != null ? (
          <span className="block font-semibold text-navy-900">
            Current tier: from referral #{summary.current_tier_min}
          </span>
        ) : null}
        {nextTierCopy}
      </p>
    </div>
  );
}
