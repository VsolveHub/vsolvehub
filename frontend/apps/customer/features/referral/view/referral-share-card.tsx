"use client";

import { Button, formatMoney } from "@vsolve/ui";
import { Check, Copy, Gift, MessageCircle, Users } from "lucide-react";
import { useState } from "react";
import type { CustomerReferralSummary } from "../queries";

function rewardLabel(paise: number, coins: number): string {
  const parts: string[] = [];
  if (paise > 0) parts.push(formatMoney(paise));
  if (coins > 0) parts.push(`${coins} V Coins`);
  return parts.join(" + ");
}

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

  const whatsappMessage = encodeURIComponent(
    `Book trusted home services on Vsolve Hub using my invite code ${summary.code} or click: ${summary.share_url}`,
  );
  const whatsappUrl = `https://api.whatsapp.com/send?text=${whatsappMessage}`;

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
      ? "Rewards are paid after your friend's first completed booking, in the wallet amount and V Coins this program publishes."
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
            {rewardSentence}
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
          </div>
        </div>

        {/* Lifetime Earnings Stat Card */}
        <div className="flex flex-col gap-3 rounded-2xl border border-[#eee9e0] bg-[#FAF9F7] p-5 lg:min-w-[240px]">
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Total Referral Rewards
            </span>
            <span
              data-numeric
              className="mt-1 block text-2xl font-extrabold tabular-nums text-emerald-700"
            >
              {formatMoney(summary.total_earned_paise)}
            </span>
          </div>

          <div className="border-t border-[#eee9e0] pt-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Users className="size-4 text-text-muted" />
              <span>Friends Joined</span>
            </div>
            <span data-numeric className="text-sm font-bold text-navy-900">
              {summary.successful_referral_count}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
