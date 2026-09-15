import { describe, expect, it } from "vitest";

import type { ServiceCard } from "./queries";
import { serviceHref } from "./service-href";

function service(overrides: Partial<ServiceCard> = {}): ServiceCard {
  return {
    id: "service-1",
    slug: "electrician-crew",
    name: "Electrician crew",
    short_description: "A crew billed by time.",
    category_slug: "workforce-and-projects",
    subcategory_slug: "electricians",
    starting_price: null,
    request_archetypes: ["A3_TIME_BLOCK"],
    bookable_variant_id: null,
    // Required since 1.43.0: the backend owns the icon vocabulary and refuses to
    // publish a service without one.
    icon_key: "electrical",
    cover: null,
    ...overrides,
  };
}

describe("serviceHref", () => {
  it("routes a workforce service directly to its crew booking flow", () => {
    expect(serviceHref(service(), "workforce-and-projects")).toBe(
      "/requests/book/electrician-crew",
    );
  });

  it("routes A10 career listings to /listings, never cart or requests", () => {
    expect(
      serviceHref(
        service({
          slug: "full-time-roles",
          request_archetypes: ["A10_LISTING"],
          starting_price: null,
          bookable_variant_id: null,
        }),
        "career-jobs",
      ),
    ).toBe("/listings?service=full-time-roles");
  });

  it("routes A10 by the Career/Jobs category slug even when no listing archetype is published", () => {
    // The taxonomy branch: a service filed under `career-jobs` is a listing
    // surface whatever its `request_archetypes` say, so a stale or empty
    // archetype list cannot send a job tile into the cart.
    expect(
      serviceHref(service({ slug: "warehouse-picker", request_archetypes: [] }), "career-jobs"),
    ).toBe("/listings?service=warehouse-picker");
  });

  it("keeps A10 precedence over a fixed price and a bookable variant", () => {
    // A priced listing must still open the listing surface — never the catalog
    // service page, cart, `/book/` or `/requests/`.
    const href = serviceHref(
      service({
        slug: "full-time-roles",
        request_archetypes: ["A10_LISTING"],
        starting_price: { amount_paise: 99900, currency: "INR" },
        bookable_variant_id: "variant-1",
      }),
      "career-jobs",
    );

    expect(href).toBe("/listings?service=full-time-roles");
    expect(href).not.toMatch(/^\/(catalog|requests|book)\b/);
  });

  it("keeps A10 precedence when the archetype list also carries A3", () => {
    expect(
      serviceHref(
        service({
          slug: "site-supervisor",
          request_archetypes: ["A3_TIME_BLOCK", "A10_LISTING"],
        }),
        "career-jobs",
      ),
    ).toBe("/listings?service=site-supervisor");
  });

  it("carries the A10 archetype past a non-Career category slug", () => {
    // The archetype decides the surface, not where merchandising filed it.
    expect(
      serviceHref(
        service({ slug: "full-time-roles", request_archetypes: ["A10_LISTING"] }),
        "home-services",
      ),
    ).toBe("/listings?service=full-time-roles");
  });

  it("routes A7 rentals to /rentals", () => {
    expect(
      serviceHref(
        service({
          slug: "drill-machine",
          request_archetypes: ["A7_RENTAL"],
          starting_price: null,
          bookable_variant_id: null,
        }),
        "rental-services",
      ),
    ).toBe("/rentals?service=drill-machine");
  });

  it("routes A9 stays to /stays", () => {
    expect(
      serviceHref(
        service({
          slug: "double-pg",
          request_archetypes: ["A9_STAY"],
          starting_price: null,
          bookable_variant_id: null,
        }),
        "rooms-pg-hostel-hotels",
      ),
    ).toBe("/stays?service=double-pg");
  });

  it("keeps the pure route builder usable without importing a Client Component", () => {
    expect(serviceHref(service({ request_archetypes: [] }), "home-services")).toBe(
      "/catalog/home-services/electrician-crew",
    );
  });
});
