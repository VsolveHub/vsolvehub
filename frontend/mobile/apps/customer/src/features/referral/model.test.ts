// Ported from frontend/apps/customer/features/referral/model.test.ts (the share-card cases),
// plus the offer copy the mobile screen used to hardcode as "GIVE ₹100, GET ₹150".
import { referralLink, referralOfferCopy, rewardLabel, shareMessageWith } from "./model";

describe("referral reward copy", () => {
  it("names the reward", () => {
    expect(rewardLabel(5000, 100)).toBe("₹50 + 100 V Coins");
    expect(rewardLabel(0, 100)).toBe("100 V Coins");
    expect(rewardLabel(0, 0)).toBe("");
  });
});

describe("the shared referral link", () => {
  it("points at the site this build links to, where the web credits the referral", () => {
    expect(referralLink("https://vsolvehub.com/", "ANU42")).toBe("https://vsolvehub.com/signup?ref=ANU42");
  });

  it("swaps the server's fixed link for this build's", () => {
    expect(
      shareMessageWith("Join me: https://vsolvehub.com/r/ANU42", "https://vsolvehub.com/r/ANU42", "https://test.example/signup?ref=ANU42"),
    ).toBe("Join me: https://test.example/signup?ref=ANU42");
    expect(shareMessageWith("Join me", "", "https://x/signup?ref=A")).toBe("Join me https://x/signup?ref=A");
  });
});

describe("the offer headline", () => {
  it("states the published program's own amounts", () => {
    const copy = referralOfferCopy({
      referee_wallet_paise: 10000,
      referee_coins_amount: 0,
      tiers: [
        { referrer_wallet_paise: 5000, referrer_coins_amount: 0 },
        { referrer_wallet_paise: 15000, referrer_coins_amount: 50 },
      ],
    });
    expect(copy.headline).toBe("Give ₹100, get up to ₹150 + 50 V Coins");
  });

  it("promises no amount when no program is published", () => {
    const copy = referralOfferCopy(null);
    expect(copy.headline).toBe("Invite friends. Rewards show here when a program is published.");
    expect(copy.headline).not.toMatch(/₹/);
  });
});
