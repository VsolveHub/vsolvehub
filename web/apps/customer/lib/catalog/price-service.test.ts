import { describe, expect, it } from "vitest";
import { coerceSelections, priceBooking } from "./price-service";

describe("priceBooking", () => {
  it("prices a technician job from its selections", () => {
    const r = priceBooking({ categorySlug: "technician", selections: { scope: "Standard repair" } });
    expect(r.totalPaise).toBe(49900);
  });

  it("falls back to the starting price for an unknown selection", () => {
    const r = priceBooking({ categorySlug: "technician", selections: { scope: "bogus" } });
    expect(r.totalPaise).toBe(29900);
  });

  it("resolves a service-level override", () => {
    const r = priceBooking({
      categorySlug: "home-services",
      subCategorySlug: "home-cleaning",
      serviceSlug: "kitchen-deep-cleaning",
      selections: { kitchenPackage: "With chimney" },
    });
    expect(r.totalPaise).toBe(129900);
  });

  it("snapshots line items alongside the total", () => {
    const r = priceBooking({
      categorySlug: "home-services",
      subCategorySlug: "pest-control",
      selections: { coverage: "Full home", extras: ["Odour treatment"] },
    });
    expect(r.totalPaise).toBe(149900 + 19900);
    expect(r.lineItems.map((l) => l.value)).toEqual(["Full home", "Odour treatment"]);
  });
});

describe("coerceSelections", () => {
  it("keeps strings, numbers, and string arrays", () => {
    expect(coerceSelections({ a: "x", b: 2, c: ["p", "q"] })).toEqual({ a: "x", b: 2, c: ["p", "q"] });
  });

  it("drops values of any other shape", () => {
    expect(coerceSelections({ a: { nested: true }, b: [1, 2], c: null, d: true })).toEqual({});
  });

  it("returns an empty object for non-objects", () => {
    expect(coerceSelections(null)).toEqual({});
    expect(coerceSelections("nope")).toEqual({});
    expect(coerceSelections([1, 2])).toEqual({});
  });

  it("ignores a client-supplied total", () => {
    // The key is simply carried through as data; estimatePrice has no field
    // named totalPaise, so it can never influence the computed price.
    const selections = coerceSelections({ scope: "Standard repair", totalPaise: 1 });
    expect(priceBooking({ categorySlug: "technician", selections }).totalPaise).toBe(49900);
  });
});
