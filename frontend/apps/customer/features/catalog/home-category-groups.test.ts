import { describe, expect, it } from "vitest";

import { groupHomeRepairs, type HomeCategorySummary } from "./home-category-groups";

function cat(slug: string, name: string): HomeCategorySummary {
  return { id: slug, slug, name, image_url: "" };
}

describe("groupHomeRepairs", () => {
  it("groups technician, electrician, and plumber into one group at the first trade slot", () => {
    const categories = [
      cat("career-jobs", "Career Opportunity"),
      cat("rental-services", "Rental Services"),
      cat("technician", "Technician"),
      cat("electrician", "Electrician"),
      cat("plumber", "Plumber"),
      cat("ac-services", "AC Services"),
    ];

    const grouped = groupHomeRepairs(categories);

    expect(grouped).toHaveLength(4);
    expect(grouped[0]).toEqual({ kind: "category", category: categories[0] });
    expect(grouped[1]).toEqual({ kind: "category", category: categories[1] });
    expect(grouped[2]).toEqual({
      kind: "group",
      members: [categories[2], categories[3], categories[4]],
    });
    expect(grouped[3]).toEqual({ kind: "category", category: categories[5] });
  });

  it("keeps a lone trade category ungrouped when fewer than two trades are published", () => {
    const categories = [cat("career-jobs", "Career Opportunity"), cat("electrician", "Electrician")];

    const grouped = groupHomeRepairs(categories);

    expect(grouped).toEqual([
      { kind: "category", category: categories[0] },
      { kind: "category", category: categories[1] },
    ]);
  });
});
