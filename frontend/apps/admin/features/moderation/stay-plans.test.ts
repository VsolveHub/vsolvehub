import { describe, expect, it } from "vitest";

import { validatePlanDraft, type Draft } from "./stay-plans";

const draft: Draft = {
  code: "pro-monthly",
  name: "Pro",
  price: "499",
  durationDays: "30",
  maxProperties: "0",
  details: "",
  isActive: true,
};

describe("host plan form", () => {
  it("builds the body in paise", () => {
    const checked = validatePlanDraft(draft, true);
    expect(checked).toEqual({
      body: {
        code: "pro-monthly",
        name: "Pro",
        price_paise: 49900,
        duration_days: 30,
        max_properties: 0,
        details: "",
        is_active: true,
      },
    });
  });

  it("refuses a bad code only when creating", () => {
    expect("error" in validatePlanDraft({ ...draft, code: "pro monthly" }, true)).toBe(true);
    expect("body" in validatePlanDraft({ ...draft, code: "pro monthly" }, false)).toBe(true);
  });

  it("refuses a missing price or zero days", () => {
    expect(validatePlanDraft({ ...draft, price: "" }, false)).toEqual({
      error: "Type the price in rupees, for example 499.",
    });
    expect("error" in validatePlanDraft({ ...draft, durationDays: "0" }, false)).toBe(true);
  });
});
