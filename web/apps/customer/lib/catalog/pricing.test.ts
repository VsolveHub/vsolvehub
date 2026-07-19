import { describe, expect, it } from "vitest";
import { estimatePrice, startingPricePaise, type PricedDetailField } from "./pricing";

const FIELDS: PricedDetailField[] = [
  {
    key: "area",
    label: "Select area",
    type: "variant",
    options: [
      { value: "Only kitchen", pricePaise: 99800 },
      { value: "1 Bathroom & kitchen", pricePaise: 109800 },
      { value: "2 Bathrooms & kitchen", pricePaise: 119800 },
    ],
  },
  { key: "balconies", label: "Balconies", type: "counter", perUnitPaise: 20000, min: 0, max: 5 },
  {
    key: "extras",
    label: "Select add-ons",
    type: "addons",
    options: [
      { value: "Deep sanitisation", pricePaise: 30000 },
      { value: "Odour treatment", pricePaise: 15000 },
    ],
  },
  { key: "notes", label: "Notes", type: "text" },
];

describe("startingPricePaise", () => {
  it("is the cheapest variant", () => {
    expect(startingPricePaise(FIELDS)).toBe(99800);
  });

  it("is zero when there is no variant field", () => {
    expect(startingPricePaise([{ key: "n", label: "N", type: "text" }])).toBe(0);
  });
});

describe("estimatePrice", () => {
  it("falls back to the cheapest variant when nothing is selected", () => {
    const r = estimatePrice(FIELDS, {});
    expect(r.basePaise).toBe(99800);
    expect(r.totalPaise).toBe(99800);
  });

  it("uses the selected variant as the base", () => {
    const r = estimatePrice(FIELDS, { area: "2 Bathrooms & kitchen" });
    expect(r.basePaise).toBe(119800);
    expect(r.totalPaise).toBe(119800);
  });

  it("multiplies counters by their unit price", () => {
    const r = estimatePrice(FIELDS, { area: "Only kitchen", balconies: 2 });
    expect(r.totalPaise).toBe(99800 + 40000);
  });

  it("sums selected add-ons", () => {
    const r = estimatePrice(FIELDS, {
      area: "Only kitchen",
      extras: ["Deep sanitisation", "Odour treatment"],
    });
    expect(r.addOnsPaise).toBe(45000);
    expect(r.totalPaise).toBe(144800);
  });

  it("ignores unknown keys and unknown option values", () => {
    const r = estimatePrice(FIELDS, { area: "Nonexistent", mystery: "x", extras: ["Nope"] });
    expect(r.totalPaise).toBe(99800);
  });

  it("emits a line item per priced selection", () => {
    const r = estimatePrice(FIELDS, { area: "Only kitchen", balconies: 1 });
    expect(r.lineItems).toEqual([
      {
        key: "area",
        label: "Select area",
        value: "Only kitchen",
        qty: 1,
        unitPaise: 99800,
        totalPaise: 99800,
        kind: "variant",
      },
      {
        key: "balconies",
        label: "Balconies",
        value: "1",
        qty: 1,
        unitPaise: 20000,
        totalPaise: 20000,
        kind: "counter",
      },
    ]);
  });

  it("never returns a negative total", () => {
    const fields: PricedDetailField[] = [
      { key: "v", label: "V", type: "variant", options: [{ value: "a", pricePaise: 10000 }] },
      { key: "d", label: "D", type: "select", options: [{ value: "off", priceDeltaPaise: -99999 }] },
    ];
    expect(estimatePrice(fields, { v: "a", d: "off" }).totalPaise).toBe(0);
  });
});
