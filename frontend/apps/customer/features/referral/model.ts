import { formatDate, formatMoney } from "@vsolve/ui";

/** "₹50 + 100 V Coins", or "" when there is nothing. */
export function rewardLabel(paise: number | null | undefined, coins: number | null | undefined): string {
  const parts: string[] = [];
  if (paise && paise > 0) parts.push(formatMoney(paise));
  if (coins && coins > 0) parts.push(`${coins} V Coins`);
  return parts.join(" + ");
}

type RewardRow = {
  status?: string;
  reward_wallet_paise?: number | null;
  reward_coins?: number | null;
  reward_available_at?: string | null;
};

/**
 * One line per referred friend saying what you get and when.
 *
 * "₹50 + 100 V Coins after their first booking" → "… · arrives 19 Oct 2026" → "… added".
 */
export function referralRewardLine(row: RewardRow): string | null {
  const amount = rewardLabel(row.reward_wallet_paise, row.reward_coins);
  if (!amount) return null;
  switch (row.status) {
    case "REWARDED":
      return `${amount} added`;
    case "QUALIFIED":
      return row.reward_available_at
        ? `${amount} arrives ${formatDate(row.reward_available_at)}`
        : `${amount} on the way`;
    case "PENDING":
      return `${amount} after their first completed booking`;
    default:
      return null;
  }
}

type Welcome = {
  status: string;
  wallet_paise: number;
  coins: number;
  reward_available_at?: string | null;
};

/** The new customer's own welcome reward, in one sentence. */
export function welcomeRewardLine(welcome: Welcome | null | undefined): string | null {
  if (!welcome) return null;
  const amount = rewardLabel(welcome.wallet_paise, welcome.coins);
  if (!amount) return null;
  if (welcome.status === "QUALIFIED") {
    return welcome.reward_available_at
      ? `Your welcome reward of ${amount} arrives on ${formatDate(welcome.reward_available_at)}.`
      : `Your welcome reward of ${amount} is on its way.`;
  }
  return `Complete your first booking to get your welcome reward of ${amount}.`;
}

/** "Rewards are added 7 days after your friend's booking, in case it is cancelled." */
export function holdExplanation(days: number): string {
  if (days <= 0) return "Rewards are added as soon as your friend completes their first booking.";
  return `Rewards are added ${days} day${days === 1 ? "" : "s"} after your friend's first completed booking, in case it is cancelled or refunded.`;
}
