// Ported from frontend/apps/partner/features/listings/job-categories.test.ts

import { HOME_CATEGORY, orderJobCategories } from "./job-categories";

const CATEGORIES = [
  { name: "Retail & Sales" },
  { name: "Healthcare" },
  { name: HOME_CATEGORY },
  { name: "Driver & Delivery" },
];

const names = (categories: readonly { name: string }[]) => categories.map((category) => category.name);

describe("the job categories an employer sees", () => {
  it("puts household help first for someone hiring for themselves", () => {
    expect(names(orderJobCategories(CATEGORIES, "INDIVIDUAL"))).toEqual([
      HOME_CATEGORY,
      "Retail & Sales",
      "Healthcare",
      "Driver & Delivery",
    ]);
  });

  it("keeps every category available, only reordered", () => {
    expect(names(orderJobCategories(CATEGORIES, "INDIVIDUAL")).sort()).toEqual(
      names(CATEGORIES).sort(),
    );
  });

  it.each(["BUSINESS", "", null, undefined])("leaves the order alone for %j", (hiringAs) => {
    expect(names(orderJobCategories(CATEGORIES, hiringAs))).toEqual(names(CATEGORIES));
  });

  it("copes with a list that has no household category", () => {
    const without = CATEGORIES.filter((category) => category.name !== HOME_CATEGORY);

    expect(names(orderJobCategories(without, "INDIVIDUAL"))).toEqual(names(without));
  });

  it("does not change the list it was given", () => {
    const before = names(CATEGORIES);

    orderJobCategories(CATEGORIES, "INDIVIDUAL");

    expect(names(CATEGORIES)).toEqual(before);
  });
});
