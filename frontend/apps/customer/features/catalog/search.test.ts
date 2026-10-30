import { fixtures } from "@vsolve/testing";
import { describe, expect, it } from "vitest";

import { bookingModeLabel, normalizeQuery, rankCatalogMatches } from "./search";
import type { Category, ServiceCard } from "./queries";

/**
 * Catalog search ranking.
 *
 * The properties worth pinning down are the ones that made the old
 * category-name filter useless: that a service is findable by its own name even
 * when its trade is called something else, that a two-letter query does not
 * match the middle of unrelated words, and that "nothing matched" is
 * reachable — the page renders a different sentence for it.
 */

const technician: Category = fixtures.category({
  slug: "technician",
  name: "Technician",
  description: "Electrical, plumbing and appliance work.",
  subcategories: [
    fixtures.subcategory({ slug: "electrical", name: "Electrical" }),
    fixtures.subcategory({
      id: "44444444-4444-4444-8444-444444444445",
      slug: "cooling",
      name: "Cooling",
    }),
  ],
});

const home: Category = fixtures.category({
  id: "55555555-5555-4555-8555-555555555556",
  slug: "home",
  name: "Home services",
  description: "Cleaning and upkeep.",
  subcategories: [fixtures.subcategory({ id: "1", slug: "cleaning", name: "Cleaning" })],
});

function service(overrides: Partial<ServiceCard>): ServiceCard {
  return fixtures.serviceCard(overrides);
}

const acService = service({
  id: "a1",
  slug: "ac-service",
  name: "AC service",
  short_description: "A technician cleans and gas-checks a split unit.",
  subcategory_slug: "cooling",
});

const surfaceClean = service({
  id: "a2",
  slug: "surface-cleaning",
  name: "Surface cleaning",
  short_description: "Wipe-down of worktops and shelving.",
  category_slug: "home",
  subcategory_slug: "cleaning",
});

const deepClean = service({
  id: "a3",
  slug: "deep-cleaning",
  name: "Deep cleaning",
  short_description: "A full clean of the whole home.",
  category_slug: "home",
  subcategory_slug: "cleaning",
});

const geyser = service({
  id: "a4",
  slug: "geyser-repair",
  name: "Geyser repair",
  short_description: "Water heater diagnosis and repair.",
  subcategory_slug: "electrical",
});

const catalog = [technician, home];
const byCategory = new Map<string, ServiceCard[]>([
  ["technician", [acService, geyser]],
  ["home", [surfaceClean, deepClean]],
]);

function search(query: string) {
  return rankCatalogMatches(catalog, byCategory, query);
}

describe("normalizeQuery", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeQuery("  Deep   CLEAN ")).toBe("deep clean");
  });
});

describe("rankCatalogMatches", () => {
  it("finds a service by its own name, whatever its trade is called", () => {
    // "geyser" appears in no category or subcategory name. The old filter
    // returned nothing for it.
    const results = search("geyser");
    expect(results.services.map((match) => match.service.slug)).toEqual(["geyser-repair"]);
  });

  it("carries the category each service was found under", () => {
    const [match] = search("geyser").services;
    expect(match?.category.slug).toBe("technician");
  });

  it("ranks an exact name above a word-start above a description mention", () => {
    const results = search("cleaning");
    expect(results.services.map((match) => match.service.slug)).toEqual([
      // "Deep cleaning" and "Surface cleaning" both match on a word start, so
      // they tie and break alphabetically.
      "deep-cleaning",
      "surface-cleaning",
    ]);
  });

  it("puts the exact name first when one matches", () => {
    const results = search("deep cleaning");
    expect(results.services[0]?.service.slug).toBe("deep-cleaning");
  });

  it("does not match the middle of an unrelated word", () => {
    // "ac" is inside "Surface cleaning". A substring match would rank a
    // worktop wipe-down against a search for an air conditioner.
    const slugs = search("ac").services.map((match) => match.service.slug);
    expect(slugs).toContain("ac-service");
    expect(slugs).not.toContain("surface-cleaning");
  });

  it("matches a service through the words in its summary", () => {
    const slugs = search("water").services.map((match) => match.service.slug);
    expect(slugs).toEqual(["geyser-repair"]);
  });

  it("returns the trades whose own names matched, alongside the services", () => {
    const results = search("cleaning");
    expect(results.categories.map((category) => category.slug)).toEqual(["home"]);
  });

  it("matches a multi-word search when every word matches, even if the phrase does not", () => {
    // Nobody's service is named "geyser fix electrical"; each word still points at one.
    expect(search("electrical geyser").services.map((match) => match.service.slug)).toEqual([
      "geyser-repair",
    ]);
  });

  it("does not match on only some of the words", () => {
    expect(search("geyser helicopter").services).toEqual([]);
  });

  it("ranks a whole-phrase match above one assembled from words", () => {
    const slugs = search("deep cleaning").services.map((match) => match.service.slug);
    expect(slugs[0]).toBe("deep-cleaning");
  });

  it("returns nothing for a query the catalogue has no answer to", () => {
    const results = search("helicopter");
    expect(results.services).toEqual([]);
    expect(results.categories).toEqual([]);
  });

  it("treats an empty query as no search rather than as matching everything", () => {
    expect(search("   ")).toEqual({ services: [], categories: [] });
  });

  it("orders ties stably, so the list does not reshuffle between renders", () => {
    expect(search("cleaning").services.map((match) => match.service.slug)).toEqual(
      search("cleaning").services.map((match) => match.service.slug),
    );
  });

  it("caps the list when asked, without dropping the matching trades", () => {
    const results = rankCatalogMatches(catalog, byCategory, "cleaning", { limit: 1 });
    expect(results.services).toHaveLength(1);
    expect(results.categories).toHaveLength(1);
  });

  it("ignores a category whose services could not be read", () => {
    // `getServicesByCategory` omits rather than empties such a category. Search
    // must still return the trades, and must not throw.
    const results = rankCatalogMatches(catalog, new Map(), "cleaning");
    expect(results.services).toEqual([]);
    expect(results.categories.map((category) => category.slug)).toEqual(["home"]);
  });
});

describe("bookingModeLabel", () => {
  it("reads the day-rate archetype", () => {
    expect(bookingModeLabel(service({ request_archetypes: ["A3_TIME_BLOCK"] }))).toBe("Day rate");
  });

  it("reads the project archetype", () => {
    expect(bookingModeLabel(service({ request_archetypes: ["A5_CUSTOM_PROJECT"] }))).toBe(
      "Quoted after visit",
    );
  });

  it("calls a priced catalogue service fixed price", () => {
    expect(bookingModeLabel(service({ request_archetypes: [] }))).toBe("Fixed price");
  });

  it("says nothing rather than guessing when there is neither", () => {
    expect(
      bookingModeLabel(service({ request_archetypes: [], starting_price: null })),
    ).toBeNull();
  });
});
