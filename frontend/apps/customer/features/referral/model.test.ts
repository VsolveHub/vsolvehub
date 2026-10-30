import { describe, expect, it } from "vitest";

import { holdExplanation, referralRewardLine, rewardLabel, welcomeRewardLine } from "./model";

describe("referral reward copy", () => {
  it("names the reward", () => {
    expect(rewardLabel(5000, 100)).toBe("₹50 + 100 V Coins");
    expect(rewardLabel(0, 100)).toBe("100 V Coins");
    expect(rewardLabel(0, 0)).toBe("");
  });

  it("says what each friend earns and when", () => {
    expect(referralRewardLine({ status: "PENDING", reward_coins: 100 })).toBe(
      "100 V Coins after their first completed booking",
    );
    expect(
      referralRewardLine({ status: "QUALIFIED", reward_coins: 100, reward_available_at: "2026-10-19T10:00:00Z" }),
    ).toMatch(/^100 V Coins arrives /);
    expect(referralRewardLine({ status: "REWARDED", reward_wallet_paise: 5000, reward_coins: 100 })).toBe(
      "₹50 + 100 V Coins added",
    );
    expect(referralRewardLine({ status: "INELIGIBLE", reward_coins: null })).toBeNull();
  });

  it("tells the new customer about their own reward", () => {
    expect(welcomeRewardLine({ status: "PENDING", wallet_paise: 0, coins: 100 })).toBe(
      "Complete your first booking to get your welcome reward of 100 V Coins.",
    );
    expect(
      welcomeRewardLine({ status: "QUALIFIED", wallet_paise: 0, coins: 100, reward_available_at: "2026-10-19T10:00:00Z" }),
    ).toMatch(/arrives on/);
    expect(welcomeRewardLine(null)).toBeNull();
  });

  it("explains the wait", () => {
    expect(holdExplanation(7)).toContain("7 days after");
    expect(holdExplanation(0)).toContain("as soon as");
  });
});
