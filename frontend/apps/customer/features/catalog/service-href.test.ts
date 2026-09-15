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
