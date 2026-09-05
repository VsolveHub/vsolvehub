import { describe, expect, it } from "vitest";

import type { ServiceCard } from "./client-queries";
import { findCatalogService, isServiceCoverUrl, serviceSlugFromLineCode } from "./service-cover";

function card(overrides: Partial<ServiceCard> = {}): ServiceCard {
  return {
    id: "svc-1",
    slug: "gas-stove-repair",
    name: "Gas Stove Repair",
    icon_key: "service",
    short_description: "",
    category_slug: "technician",
    subcategory_slug: "gas",
    starting_price: null,
    bookable_variant_id: null,
    request_archetypes: [],
    cover: {
      id: "media-1",
      kind: "COVER",
      url: "https://cdn.example/gas-stove.jpg",
      alt_text: "Gas Stove Repair",
    },
    ...overrides,
  };
}

describe("serviceSlugFromLineCode", () => {
  it("reads the catalogue slug from a fulfilment task code", () => {
    expect(serviceSlugFromLineCode("task.gas-stove-repair")).toBe("gas-stove-repair");
    expect(serviceSlugFromLineCode("task.electrician-wall-fan-installation")).toBe(
      "electrician-wall-fan-installation",
    );
  });

  it("ignores codes that are not a task slug", () => {
    expect(serviceSlugFromLineCode("fee.platform")).toBeNull();
    expect(serviceSlugFromLineCode("task.")).toBeNull();
    expect(serviceSlugFromLineCode("")).toBeNull();
  });
});

describe("findCatalogService", () => {
  const catalog = [
    card(),
    card({
      id: "svc-2",
      slug: "event-catering",
      name: "Event Catering",
      category_slug: "events",
      subcategory_slug: "event-services",
      cover: {
        id: "media-2",
        kind: "COVER",
        url: "https://cdn.example/catering.jpg",
        alt_text: "Event Catering",
      },
    }),
  ];

  it("prefers the published slug so a later cover change is picked up automatically", () => {
    expect(findCatalogService(catalog, { slug: "event-catering" })?.cover?.url).toBe(
      "https://cdn.example/catering.jpg",
    );
  });

  it("falls back to a case-insensitive name match when the slug is missing", () => {
    expect(findCatalogService(catalog, { name: "gas stove repair" })?.slug).toBe("gas-stove-repair");
  });

  it("uses the category to disambiguate two services with the same name", () => {
    const duplicates = [
      card({ id: "a", slug: "alpha", name: "Staff", category_slug: "events" }),
      card({ id: "b", slug: "beta", name: "Staff", category_slug: "housekeeping" }),
    ];

    expect(findCatalogService(duplicates, { name: "Staff", categorySlug: "housekeeping" })?.slug).toBe(
      "beta",
    );
  });

  it("returns nothing rather than inventing a cover", () => {
    expect(findCatalogService(catalog, { slug: "unknown", name: "Unknown" })).toBeUndefined();
  });
});

describe("isServiceCoverUrl", () => {
  it("recognises the authored 3D covers so they are not cropped like photographs", () => {
    expect(isServiceCoverUrl("https://cdn.example/Service%20Cover/gas.png")).toBe(true);
    expect(isServiceCoverUrl("https://cdn.example/Service Cover/gas.png")).toBe(true);
    expect(isServiceCoverUrl("https://cdn.example/photos/gas.jpg")).toBe(false);
  });
});
