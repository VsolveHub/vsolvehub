// Ported from frontend/apps/partner/features/listings/job-categories.test.ts
import { HOME_CATEGORY, jobCategoryLayout, rankRoleMatches } from "./job-categories";

const CATEGORIES = [
  { name: "Retail & Sales", roles: ["Sales Executive"] },
  { name: "Healthcare", roles: ["Staff Nurse"] },
  { name: HOME_CATEGORY, roles: ["House Help / Maid", "Home Cook"] },
  { name: "Driver & Delivery", roles: ["Car Driver"] },
];

const names = (categories: readonly { name: string }[]) => categories.map((category) => category.name);

describe("the job categories an employer is shown", () => {
  it("gives someone hiring for themselves the household roles straight away", () => {
    const layout = jobCategoryLayout(CATEGORIES, "INDIVIDUAL");

    expect(layout.home?.name).toBe(HOME_CATEGORY);
    expect(names(layout.others)).toEqual(["Retail & Sales", "Healthcare", "Driver & Delivery"]);
  });

  it("keeps every category within their reach, none dropped", () => {
    const layout = jobCategoryLayout(CATEGORIES, "INDIVIDUAL");

    expect([layout.home!.name, ...names(layout.others)].sort()).toEqual(names(CATEGORIES).sort());
  });

  it.each(["BUSINESS", "", null, undefined])("shows the whole grid in the server's order for %j", (hiringAs) => {
    const layout = jobCategoryLayout(CATEGORIES, hiringAs);

    expect(layout.home).toBeNull();
    expect(names(layout.others)).toEqual(names(CATEGORIES));
  });

  it("falls back to the grid when the server offers no household roles", () => {
    const empty = CATEGORIES.map((category) =>
      category.name === HOME_CATEGORY ? { ...category, roles: [] } : category,
    );
    const without = CATEGORIES.filter((category) => category.name !== HOME_CATEGORY);

    expect(jobCategoryLayout(empty, "INDIVIDUAL")).toEqual({ home: null, others: empty });
    expect(jobCategoryLayout(without, "INDIVIDUAL")).toEqual({ home: null, others: without });
  });

  it("does not change the list it was given", () => {
    const before = names(CATEGORIES);

    jobCategoryLayout(CATEGORIES, "INDIVIDUAL");

    expect(names(CATEGORIES)).toEqual(before);
  });
});

describe("search matches", () => {
  const MATCHES = [
    { category: "Driver & Delivery", role: "Heavy Vehicle Driver" },
    { category: HOME_CATEGORY, role: "Personal / Family Driver" },
    { category: "Driver & Delivery", role: "Car Driver" },
  ];

  it("put household roles first for someone hiring for themselves", () => {
    expect(rankRoleMatches(MATCHES, "INDIVIDUAL").map((match) => match.role)).toEqual([
      "Personal / Family Driver",
      "Heavy Vehicle Driver",
      "Car Driver",
    ]);
  });

  it.each(["BUSINESS", "", null, undefined])("keep the server's order for %j", (hiringAs) => {
    expect(rankRoleMatches(MATCHES, hiringAs)).toEqual(MATCHES);
  });
});
