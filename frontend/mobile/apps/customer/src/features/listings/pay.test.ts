import { listingPayText } from "./pay";

describe("listingPayText", () => {
  it("uses the listing's own pay period, never an assumed /mo", () => {
    expect(
      listingPayText({ salary_min_paise: 120000000, salary_max_paise: 180000000, salary_period: "YEARLY" }),
    ).toBe("₹12,00,000 – ₹18,00,000/yr");
    expect(listingPayText({ salary_min_paise: 50000, salary_period: "DAILY" })).toBe("₹500/day");
  });

  it("returns null when the employer published no pay, instead of inventing a range", () => {
    expect(listingPayText({})).toBeNull();
    expect(listingPayText({ salary_display: "  " })).toBeNull();
  });

  it("prefers the structured pay text when present", () => {
    expect(listingPayText({ salary_min_paise: 100 }, "As per experience")).toBe("As per experience");
  });

  it("omits the unit when the period is unknown rather than guessing", () => {
    expect(listingPayText({ salary_min_paise: 1000000, salary_max_paise: 1500000 })).toBe("₹10,000 – ₹15,000");
  });
});
