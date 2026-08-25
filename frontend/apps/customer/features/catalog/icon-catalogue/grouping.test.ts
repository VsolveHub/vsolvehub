import { describe, expect, it } from "vitest";

import type { ServiceIndexItem } from "../queries";
import { groupServiceIndex } from "./grouping";

/**
 * One index row, with everything but the interesting part defaulted.
 *
 * Written positionally rather than as a `Partial` spread so a test reads as the
 * data it is about: "these two services, same subcategory, both at order 0".
 */
function row(overrides: Partial<ServiceIndexItem> & { slug: string }): ServiceIndexItem {
  return {
    id: `id-${overrides.slug}`,
    name: overrides.slug,
    icon_key: "service",
    display_order: 0,
    category_id: "cat-home",
    category_slug: "home",
    category_name: "Home",
    category_display_order: 0,
    subcategory_id: "sub-plumber",
    subcategory_slug: "plumber",
    subcategory_name: "Plumber",
    subcategory_display_order: 0,
    ...overrides,
  };
}

/** Every service slug, in render order, flattened across the whole result. */
function renderedSlugs(categories: ReturnType<typeof groupServiceIndex>): string[] {
  return categories.flatMap((category) =>
    category.subcategories.flatMap((subcategory) =>
      subcategory.services.map((service) => service.slug),
    ),
  );
}

describe("folding the flat index into sections", () => {
  it("puts each service under its own category and subcategory", () => {
    const grouped = groupServiceIndex([
      row({ slug: "fan-repair", subcategory_id: "sub-electrician", subcategory_slug: "electrician", subcategory_name: "Electrician" }),
      row({ slug: "tap-replacement" }),
      row({
        slug: "pet-bath",
        category_id: "cat-pets",
        category_slug: "pets",
        category_name: "Pets",
        category_display_order: 1,
        subcategory_id: "sub-grooming",
        subcategory_slug: "grooming",
        subcategory_name: "Grooming",
      }),
    ]);

    expect(grouped.map((category) => category.slug)).toEqual(["home", "pets"]);
    expect(grouped[0]?.subcategories.map((subcategory) => subcategory.slug)).toEqual([
      "electrician",
      "plumber",
    ]);
    expect(grouped[1]?.subcategories[0]?.services.map((service) => service.slug)).toEqual([
      "pet-bath",
    ]);
  });

  it("merges rows that revisit a category later in the payload", () => {
    // The endpoint makes no promise that a category's rows are contiguous, and
    // a second "Home" heading further down the page is the visible symptom.
    const grouped = groupServiceIndex([
      row({ slug: "tap-replacement" }),
      row({
        slug: "pet-bath",
        category_id: "cat-pets",
        category_slug: "pets",
        category_name: "Pets",
        category_display_order: 1,
      }),
      row({ slug: "drain-clearing" }),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.subcategories[0]?.services.map((service) => service.slug)).toEqual([
      "drain-clearing",
      "tap-replacement",
    ]);
  });

  it("counts every service beneath a category, not just the first trade", () => {
    const grouped = groupServiceIndex([
      row({ slug: "fan-repair", subcategory_id: "sub-electrician", subcategory_slug: "electrician" }),
      row({ slug: "mcb-install", subcategory_id: "sub-electrician", subcategory_slug: "electrician" }),
      row({ slug: "tap-replacement" }),
    ]);

    expect(grouped[0]?.serviceCount).toBe(3);
  });

  it("returns nothing at all for an empty catalogue", () => {
    expect(groupServiceIndex([])).toEqual([]);
  });

  it("leaves the caller's array untouched", () => {
    const items = [
      row({ slug: "z-service", display_order: 1 }),
      row({ slug: "a-service", display_order: 0 }),
    ];

    groupServiceIndex(items);

    expect(items.map((item) => item.slug)).toEqual(["z-service", "a-service"]);
  });
});

describe("the order the backend published", () => {
  it("honours display_order at the category level", () => {
    const grouped = groupServiceIndex([
      row({ slug: "pet-bath", category_id: "cat-pets", category_slug: "pets", category_display_order: 2 }),
      row({ slug: "tap-replacement", category_display_order: 1 }),
      row({ slug: "facial", category_id: "cat-beauty", category_slug: "beauty", category_display_order: 0 }),
    ]);

    expect(grouped.map((category) => category.slug)).toEqual(["beauty", "home", "pets"]);
  });

  it("honours display_order at the subcategory level", () => {
    const grouped = groupServiceIndex([
      row({ slug: "tap-replacement", subcategory_display_order: 2 }),
      row({
        slug: "fan-repair",
        subcategory_id: "sub-electrician",
        subcategory_slug: "electrician",
        subcategory_display_order: 1,
      }),
      row({
        slug: "ac-service",
        subcategory_id: "sub-ac",
        subcategory_slug: "ac",
        subcategory_display_order: 0,
      }),
    ]);

    expect(grouped[0]?.subcategories.map((subcategory) => subcategory.slug)).toEqual([
      "ac",
      "electrician",
      "plumber",
    ]);
  });

  it("honours display_order at the service level, ahead of the name", () => {
    const grouped = groupServiceIndex([
      row({ slug: "aaa", name: "Aaa", display_order: 9 }),
      row({ slug: "zzz", name: "Zzz", display_order: 1 }),
    ]);

    // Ops put Zzz first. Alphabetising over that would silently discard a
    // merchandising decision.
    expect(renderedSlugs(grouped)).toEqual(["zzz", "aaa"]);
  });
});

describe("ties, which display_order does not forbid", () => {
  it("falls through to the name when two services share a display_order", () => {
    const grouped = groupServiceIndex([
      row({ slug: "wc-install", name: "WC Installation" }),
      row({ slug: "drain-block", name: "Drain Block Removal" }),
      row({ slug: "pipe-leak", name: "Pipe Leakage Fix" }),
    ]);

    expect(renderedSlugs(grouped)).toEqual(["drain-block", "pipe-leak", "wc-install"]);
  });

  it("falls through to the id when the name ties too", () => {
    // Two subcategories can legitimately publish "Deep Cleaning".
    const grouped = groupServiceIndex([
      row({ slug: "deep-clean-b", id: "id-b", name: "Deep Cleaning" }),
      row({ slug: "deep-clean-a", id: "id-a", name: "Deep Cleaning" }),
    ]);

    expect(renderedSlugs(grouped)).toEqual(["deep-clean-a", "deep-clean-b"]);
  });

  it("orders a tied category by name, then id", () => {
    const grouped = groupServiceIndex([
      row({ slug: "s1", category_id: "cat-2", category_slug: "second", category_name: "Same" }),
      row({ slug: "s2", category_id: "cat-1", category_slug: "first", category_name: "Same" }),
      row({ slug: "s3", category_id: "cat-0", category_slug: "appliances", category_name: "Appliances" }),
    ]);

    expect(grouped.map((category) => category.slug)).toEqual(["appliances", "first", "second"]);
  });

  it("produces the same page whichever way the server serialised the rows", () => {
    // The real defect this guards: with only display_order in the comparator,
    // sort stability makes the payload's row order the tie-break, so a grid can
    // reshuffle between two deploys that changed no data at all.
    const items = [
      row({ slug: "a", name: "Alpha" }),
      row({ slug: "b", name: "Bravo" }),
      row({ slug: "c", name: "Charlie", subcategory_id: "sub-ac", subcategory_slug: "ac" }),
      row({ slug: "d", name: "Delta", category_id: "cat-pets", category_slug: "pets" }),
    ];

    const forwards = renderedSlugs(groupServiceIndex(items));
    const backwards = renderedSlugs(groupServiceIndex([...items].reverse()));

    expect(backwards).toEqual(forwards);
  });
});

describe("labels repeated on every row", () => {
  it("resolves a disagreement to the first occurrence, deterministically", () => {
    const grouped = groupServiceIndex([
      row({ slug: "tap-replacement", category_name: "Home" }),
      row({ slug: "drain-block", category_name: "Home Services" }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.name).toBe("Home");
  });
});
