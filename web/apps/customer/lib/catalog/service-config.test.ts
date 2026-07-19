import { describe, expect, it } from "vitest";
import { getServiceConfig, defaultDetailValues, toDetailPairs } from "./service-config";
import { estimatePrice, startingPricePaise } from "./pricing";

const CATEGORIES = ["technician", "beauty-wellness", "home-services", "pet-services"];

/** Every layer that overrides detailFields must carry its own variant field. */
const OVERRIDES: [string, string | null, string | null][] = [
  ["technician", null, "switch-socket-repair"],
  ["technician", null, "fan-installation"],
  ["technician", null, "ac-general-service"],
  ["home-services", "home-cleaning", null],
  ["home-services", "pest-control", null],
  ["home-services", null, "bathroom-deep-cleaning"],
  ["home-services", null, "kitchen-deep-cleaning"],
];

describe("category defaults", () => {
  for (const slug of CATEGORIES) {
    it(`${slug} exposes exactly one variant field`, () => {
      const variants = getServiceConfig(slug).detailFields.filter((f) => f.type === "variant");
      expect(variants).toHaveLength(1);
    });

    it(`${slug} has a positive starting price`, () => {
      expect(startingPricePaise(getServiceConfig(slug).detailFields)).toBeGreaterThan(0);
    });

    it(`${slug} prices an empty selection at its starting price`, () => {
      const fields = getServiceConfig(slug).detailFields;
      expect(estimatePrice(fields, {}).totalPaise).toBe(startingPricePaise(fields));
    });

    it(`${slug} prices its defaults at or above the starting price`, () => {
      const fields = getServiceConfig(slug).detailFields;
      const total = estimatePrice(fields, defaultDetailValues(fields)).totalPaise;
      expect(total).toBeGreaterThanOrEqual(startingPricePaise(fields));
    });
  }
});

describe("overrides", () => {
  for (const [category, sub, service] of OVERRIDES) {
    const name = service ?? sub ?? category;
    it(`${name} keeps exactly one variant after the layer replaces detailFields`, () => {
      const fields = getServiceConfig(category, sub, service).detailFields;
      expect(fields.filter((f) => f.type === "variant")).toHaveLength(1);
      expect(startingPricePaise(fields)).toBeGreaterThan(0);
    });
  }

  it("pest control matches the advertised area pricing", () => {
    const fields = getServiceConfig("home-services", "pest-control").detailFields;
    expect(startingPricePaise(fields)).toBe(99800);
    expect(estimatePrice(fields, { coverage: "2 Bathrooms & kitchen" }).totalPaise).toBe(119800);
  });

  it("adds counter units on top of the variant base", () => {
    const fields = getServiceConfig("technician", null, "fan-installation").detailFields;
    const r = estimatePrice(fields, { fanType: "Ceiling fan", extraFans: 2 });
    expect(r.totalPaise).toBe(39900 + 2 * 24900);
  });

  it("applies a priced select delta", () => {
    const fields = getServiceConfig("home-services", null, "kitchen-deep-cleaning").detailFields;
    const r = estimatePrice(fields, {
      kitchenPackage: "Standard kitchen",
      greaseLevel: "Heavy / post-construction",
    });
    expect(r.totalPaise).toBe(89900 + 19900);
  });
});

describe("an unknown category", () => {
  it("still prices from the generic fallback", () => {
    const fields = getServiceConfig("does-not-exist").detailFields;
    expect(startingPricePaise(fields)).toBeGreaterThan(0);
  });
});

describe("defaultDetailValues", () => {
  it("seeds addons as an empty array and variants as the first option", () => {
    const fields = getServiceConfig("technician").detailFields;
    const values = defaultDetailValues(fields);
    expect(values.scope).toBe("Inspection & diagnosis");
    expect(values.extras).toEqual([]);
  });
});

describe("toDetailPairs", () => {
  it("renders a multi-select add-on list as a readable string", () => {
    const fields = getServiceConfig("technician").detailFields;
    const pairs = toDetailPairs(fields, {
      scope: "Standard repair",
      extras: ["Same-day priority", "Annual maintenance check"],
    });
    expect(pairs).toEqual([
      { label: "Select scope", value: "Standard repair" },
      { label: "Select add-ons", value: "Same-day priority, Annual maintenance check" },
    ]);
  });

  it("drops empty values", () => {
    const fields = getServiceConfig("technician").detailFields;
    expect(toDetailPairs(fields, { scope: "Standard repair", extras: [] })).toEqual([
      { label: "Select scope", value: "Standard repair" },
    ]);
  });
});
