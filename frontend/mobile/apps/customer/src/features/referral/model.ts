// Ported from frontend/apps/customer/features/referral/model.ts (the parts the share card uses)
import { formatMoney } from "@vsolve/mobile-ui";

/** "₹50 + 100 V Coins", or "" when there is nothing. */
export function rewardLabel(paise: number | null | undefined, coins: number | null | undefined): string {
  const parts: string[] = [];
  if (paise && paise > 0) parts.push(formatMoney(paise));
  if (coins && coins > 0) parts.push(`${coins} V Coins`);
  return parts.join(" + ");
}

/**
 * The link a referrer shares, on the site this build points at (`EXPO_PUBLIC_WEB_BASE_URL`).
 * The server's stored `share_url` carries one fixed domain, so a test build would otherwise
 * send friends to production. `/signup?ref=` is where the web credits the referral.
 */
export function referralLink(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/$/, "")}/signup?ref=${encodeURIComponent(code)}`;
}

/** The server's share message, with its link swapped for `link`; the link is appended if absent. */
export function shareMessageWith(message: string, serverUrl: string, link: string): string {
  if (serverUrl && message.includes(serverUrl)) return message.split(serverUrl).join(link);
  return message.includes(link) ? message : `${message} ${link}`.trim();
}

/**
 * The share card's headline and sentence, from the published program's real amounts, word for
 * word the web's: the friend's reward and the top tier's reward for the referrer.
 */
export function referralOfferCopy(
  program:
    | {
        referee_wallet_paise?: number | null;
        referee_coins_amount?: number | null;
        tiers?: readonly { referrer_wallet_paise?: number | null; referrer_coins_amount?: number | null }[];
      }
    | null
    | undefined,
): { headline: string; sentence: string } {
  const refereeLabel = rewardLabel(program?.referee_wallet_paise ?? 0, program?.referee_coins_amount ?? 0);
  const topTier = program?.tiers?.at(-1);
  const referrerLabel = rewardLabel(topTier?.referrer_wallet_paise ?? 0, topTier?.referrer_coins_amount ?? 0);
  const headline =
    refereeLabel && referrerLabel
      ? `Give ${refereeLabel}, get up to ${referrerLabel}`
      : refereeLabel || referrerLabel
        ? `Invite friends and earn ${refereeLabel || referrerLabel}`
        : "Invite friends. Rewards show here when a program is published.";
  const sentence =
    refereeLabel || referrerLabel
      ? "Rewards are added a few days after your friend's first booking is completed."
      : "Share your code. A published program decides whether the reward is wallet balance, V Coins, or both.";
  return { headline, sentence };
}
