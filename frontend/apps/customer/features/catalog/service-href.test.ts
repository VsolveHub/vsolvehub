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

  it("keeps the pure route builder usable without importing a Client Component", () => {
    expect(serviceHref(service({ request_archetypes: [] }), "home-services")).toBe(
      "/catalog/home-services/electrician-crew",
    );
  });
});
