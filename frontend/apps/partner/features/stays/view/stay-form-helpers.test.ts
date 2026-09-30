import { describe, expect, it } from "vitest";

import {
  stayListingStatus,
  stayPropertyTypes,
  type StayTaxonomySubcategory,
} from "@/features/stays/queries";

import { collectSchemaAnswers, rupeesToPaise, wholeNumber } from "./stay-form-helpers";

function variant(id: string) {
  return {
    id,
    name: id,
    code: id,
    property_schema: {},
    room_schema: {},
    room_name_suggestions: [],
    booking_mode: "ENQUIRY",
    price_period: "MONTH",
  };
}

describe("stayPropertyTypes", () => {
  it("offers one choice per property type instead of category → service → variant", () => {
    const taxonomy: StayTaxonomySubcategory[] = [
      {
        id: "s1",
        name: "PG Accommodation",
        slug: "pg",
        services: [{ id: "a", name: "PG", slug: "pg", variants: [variant("pg-stay")] }],
      },
      {
        id: "s2",
        name: "Hotels",
        slug: "hotels",
        services: [
          { id: "b", name: "Budget", slug: "budget", variants: [variant("budget")] },
          { id: "c", name: "Luxury", slug: "luxury", variants: [variant("luxury")] },
        ],
      },
    ];

    expect(stayPropertyTypes(taxonomy).map((type) => type.label)).toEqual([
      "PG Accommodation",
      "Hotels – Budget",
      "Hotels – Luxury",
    ]);
  });
});

describe("stayListingStatus", () => {
  it("says a paused property is hidden, not live", () => {
    expect(stayListingStatus({ moderation_status: "APPROVED", listing_status: "PAUSED" }).label).toBe(
      "Paused — hidden from guests",
    );
  });

  it("shows archived ahead of any review state", () => {
    expect(stayListingStatus({ moderation_status: "DRAFT", listing_status: "ARCHIVED" }).label).toBe(
      "Archived",
    );
  });

  it("names a pending property as a quick review", () => {
    expect(stayListingStatus({ moderation_status: "PENDING", listing_status: "LIVE" }).label).toBe(
      "Under quick review",
    );
  });
});

describe("rupeesToPaise", () => {
  it("reads rupees as typed", () => {
    expect(rupeesToPaise("₹1,250.50")).toBe(125050);
  });

  it("refuses zero, so no room is ever priced at ₹0", () => {
    expect(rupeesToPaise("0")).toBeNull();
  });
});

describe("wholeNumber", () => {
  it("accepts counts of 1 or more only", () => {
    expect(wholeNumber("3")).toBe(3);
    expect(wholeNumber("0")).toBeNull();
    expect(wholeNumber("2.5")).toBeNull();
  });
});

describe("collectSchemaAnswers", () => {
  const schema = {
    required: ["gender"],
    properties: { gender: { enum: ["Gents", "Ladies"] }, wifi: { type: "boolean" } },
  };

  it("names the first missing required question", () => {
    expect(collectSchemaAnswers(schema, {})).toEqual({ missing: "For" });
  });

  it("converts answers to the stored types", () => {
    expect(collectSchemaAnswers(schema, { gender: "Ladies", wifi: "true" })).toEqual({
      values: { gender: "Ladies", wifi: true },
    });
  });
});
