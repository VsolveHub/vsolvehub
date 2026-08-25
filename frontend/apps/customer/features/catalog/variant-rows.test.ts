import { describe, expect, it } from "vitest";

import type { ServiceDetail } from "./queries";
import { variantRows } from "./variant-rows";

function detail(overrides: Partial<ServiceDetail> = {}): ServiceDetail {
  return {
    id: "svc-1",
    slug: "full-bathroom-renovation",
    name: "Full bathroom renovation",
    icon_key: "plumbing",
    short_description: "",
    category_slug: "workforce-and-projects",
    subcategory_slug: "renovation-projects",
    starting_price: null,
    bookable_variant_id: null,
    request_archetypes: [],
    cover: null,
    variants: [],
    requirement_variants: [],
    policies: [],
    media: [],
    ...overrides,
  } as ServiceDetail;
}

const PRICED = {
  id: "var-a1",
  code: "standard",
  name: "Tap replacement",
  description: "Per fitting, parts extra.",
  fulfilment_archetype: "A1_TASK_VISIT",
  starting_price: { amount_paise: 49_900, currency: "INR" },
  minimum_service_subtotal: { amount_paise: 0, currency: "INR" },
  task_lines: [],
  required_skill_code: "plumber",
  questions: [],
} as unknown as ServiceDetail["variants"][number];

function guided(archetype: string) {
  return {
    id: `var-${archetype}`,
    code: "standard",
    name: "Renovation, priced on site",
    description: "",
    fulfilment_archetype: archetype,
    questions: [],
  } as unknown as ServiceDetail["requirement_variants"][number];
}

describe("the rows a category card prints for one service", () => {
  it("prints priced rows first, then the quote-based ones", () => {
    const rows = variantRows(
      detail({ variants: [PRICED], requirement_variants: [guided("A5_CUSTOM_PROJECT")] }),
      "workforce-and-projects",
    );

    expect(rows.map((row) => row.price !== null)).toEqual([true, false]);
  });

  it("sends a priced variant to the service's own booking page", () => {
    const [row] = variantRows(detail({ variants: [PRICED] }), "workforce-and-projects");

    expect(row?.href).toBe("/catalog/workforce-and-projects/full-bathroom-renovation");
    expect(row?.price).toEqual({ amount_paise: 49_900, currency: "INR" });
    expect(row?.priceNote).toBeNull();
  });

  it("sends an A5 project straight to the brief, priced on site", () => {
    const [row] = variantRows(
      detail({ requirement_variants: [guided("A5_CUSTOM_PROJECT")] }),
      "workforce-and-projects",
    );

    expect(row?.href).toBe("/requests/new/full-bathroom-renovation");
    expect(row?.price).toBeNull();
    expect(row?.priceNote).toBe("Priced on site");
  });

  it("sends an A3 crew variant to the crew form at a day rate", () => {
    const [row] = variantRows(
      detail({ requirement_variants: [guided("A3_TIME_BLOCK")] }),
      "workforce-and-projects",
    );

    expect(row?.href).toBe("/requests/book/full-bathroom-renovation");
    expect(row?.priceNote).toBe("Day rate");
  });

  it("treats an unrecognised guided archetype as a brief, not a dead end", () => {
    // A newer contract's archetype must still start somewhere this client can
    // render; the brief is the one guided entry point that exists for all.
    const [row] = variantRows(
      detail({ requirement_variants: [guided("A9_FUTURE_THING")] }),
      "workforce-and-projects",
    );

    expect(row?.href).toBe("/requests/new/full-bathroom-renovation");
    expect(row?.priceNote).toBe("Priced on site");
  });
});
