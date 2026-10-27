import { createTranslator } from "@vsolve/ui";
import { describe, expect, it } from "vitest";

import { catalogs } from "@/i18n/catalogs";

import {
  stayListingStatus,
  stayPropertyTypes,
  type StayTaxonomySubcategory,
} from "@/features/stays/queries";

import {
  MAX_PHOTO_BYTES,
  PHOTO_TOO_LARGE_KEY,
  amenitiesFrom,
  collectSchemaAnswers,
  rupeesToPaise,
  splitBySize,
  wholeNumber,
} from "./stay-form-helpers";

const t = createTranslator("en-IN", catalogs["en-IN"]).t;

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
    expect(stayListingStatus({ moderation_status: "APPROVED", listing_status: "PAUSED" }, t).label).toBe(
      "Paused — hidden from guests",
    );
  });

  it("shows archived ahead of any review state", () => {
    expect(stayListingStatus({ moderation_status: "DRAFT", listing_status: "ARCHIVED" }, t).label).toBe(
      "Archived",
    );
  });

  it("names a pending property as a quick review", () => {
    expect(stayListingStatus({ moderation_status: "PENDING", listing_status: "LIVE" }, t).label).toBe(
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
    expect(collectSchemaAnswers(schema, {}, t)).toEqual({ missing: "For" });
  });

  it("converts answers to the stored types", () => {
    expect(collectSchemaAnswers(schema, { gender: "Ladies", wifi: "true" }, t)).toEqual({
      values: { gender: "Ladies", wifi: true },
    });
  });
});

describe("photo size limit", () => {
  const photo = (size: number) => ({ size }) as File;

  it("keeps photos up to 10 MB and says why the rest were skipped", () => {
    const small = photo(MAX_PHOTO_BYTES);
    const big = photo(MAX_PHOTO_BYTES + 1);
    expect(splitBySize([small, big], t)).toEqual({ ok: [small], tooLarge: t(PHOTO_TOO_LARGE_KEY) });
    expect(splitBySize([small], t)).toEqual({ ok: [small], tooLarge: null });
  });
});

describe("amenitiesFrom", () => {
  it("reads only the offered amenities, and only a real true as ticked", () => {
    const options = [
      { key: "wifi", label: "WiFi" },
      { key: "lift", label: "Lift" },
    ];
    expect(amenitiesFrom({ wifi: true, lift: "true", gender: "Ladies" }, options)).toEqual({
      wifi: true,
      lift: false,
    });
    expect(amenitiesFrom(null, undefined)).toEqual({});
  });
});
