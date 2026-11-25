import { describe, expect, it } from "vitest";

import {
  KIND_FILTERS,
  OPEN_STATES,
  PARCEL_DEFAULTS,
  PARCEL_VEHICLES,
  RIDE_FILTERS,
  VEHICLE_TYPES,
  canForceCancel,
  changedParcelLimits,
  gramsToKg,
  kgToGrams,
  kindLabel,
  limitsText,
  paymentText,
  readParcelLimits,
  stateLabel,
  stateTone,
} from "./model";

describe("states a parcel can be in", () => {
  it("counts a returning parcel as open, so Operations can still end it", () => {
    expect(OPEN_STATES).toContain("RETURNING");
    expect(canForceCancel("RETURNING")).toBe(true);
    expect(stateTone("RETURNING")).toBe("info");
  });

  it("does not offer to cancel a parcel that is back or delivered", () => {
    expect(canForceCancel("RETURNED")).toBe(false);
    expect(canForceCancel("COMPLETED")).toBe(false);
  });

  it("says Delivered for a parcel and Completed for a ride", () => {
    expect(stateLabel("COMPLETED", "PARCEL")).toBe("Delivered");
    expect(stateLabel("COMPLETED", "RIDE")).toBe("Completed");
    expect(stateLabel("COMPLETED")).toBe("Completed");
    expect(stateLabel("RETURNING")).toBe("Returning");
    expect(stateLabel("RETURNED")).toBe("Returned");
  });

  it("names the kind", () => {
    expect(kindLabel("PARCEL")).toBe("Pick up & Drop");
    expect(kindLabel("RIDE")).toBe("Ride");
    expect(kindLabel(undefined)).toBe("Ride");
  });
});

describe("the list filters (§7.1)", () => {
  it("has a Live filter that includes parcels coming back", () => {
    const live = RIDE_FILTERS.find((filter) => filter.key === "live");
    expect(live?.states.split(",")).toContain("RETURNING");
  });

  it("has an Unpaid filter that looks at every state, not one", () => {
    const unpaid = RIDE_FILTERS.find((filter) => filter.key === "unpaid");
    expect(unpaid).toMatchObject({ label: "Unpaid", states: "", paymentStatus: "UNPAID" });
  });

  it("has a kind filter: everything, rides, or Pick up & Drop", () => {
    expect(KIND_FILTERS.map((kind) => [kind.label, kind.kind])).toEqual([
      ["All", ""],
      ["Rides", "RIDE"],
      ["Pick up & Drop", "PARCEL"],
    ]);
  });

  it("says what a payment is, including a parcel nobody paid for", () => {
    expect(paymentText("COLLECTED")).toBe("Collected by captain");
    expect(paymentText("DUE")).toBe("Due");
    expect(paymentText("UNPAID")).toBe("Not paid: follow up");
  });
});

describe("vehicles", () => {
  it("uses the server's code for a cab (CAB, not CAR)", () => {
    expect(VEHICLE_TYPES.map((type) => type.code)).toEqual(["BIKE", "AUTO", "CAB"]);
  });

  it("has parcel cards for a bike or an auto only", () => {
    expect(PARCEL_VEHICLES).toEqual(["BIKE", "AUTO"]);
  });
});

describe("parcel limits (D5)", () => {
  it("starts a new card from the brief's defaults", () => {
    expect(PARCEL_DEFAULTS.BIKE).toEqual({ weightKg: "10", size: "40 x 30 x 20 cm" });
    expect(PARCEL_DEFAULTS.AUTO).toEqual({ weightKg: "50", size: "1.3 x 3.5 x 3.3 ft" });
    expect(PARCEL_DEFAULTS.CAB).toBeUndefined();
  });

  it("turns kilograms into the grams the server stores", () => {
    expect(kgToGrams("10")).toBe(10_000);
    expect(kgToGrams(" 7.5 ")).toBe(7_500);
    expect(kgToGrams("0.001")).toBe(1);
    for (const bad of ["", "0", "-5", "abc", "1e400", "0.0001"]) expect(kgToGrams(bad)).toBeNull();
  });

  it("shows grams as kilograms", () => {
    expect(gramsToKg(10_000)).toBe("10");
    expect(gramsToKg(7_500)).toBe("7.5");
  });

  it("reads the weight and the size, or says which is wrong", () => {
    expect(readParcelLimits("10", " 40 x 30 x 20 cm ")).toEqual({
      limits: { max_parcel_weight_grams: 10_000, parcel_size_label: "40 x 30 x 20 cm" },
    });
    expect(readParcelLimits("", "small")).toEqual({ error: "Check “Max weight (kg)”: a number above 0." });
    expect(readParcelLimits("10", "  ")).toMatchObject({ error: expect.stringContaining("Size") });
    expect(readParcelLimits("10", "x".repeat(41))).toMatchObject({ error: expect.stringContaining("40 characters") });
  });

  it("sends only the limits that changed", () => {
    const card = { max_parcel_weight_grams: 10_000, parcel_size_label: "40 x 30 x 20 cm" };

    expect(changedParcelLimits(card, { max_parcel_weight_grams: 10_000, parcel_size_label: "40 x 30 x 20 cm" })).toEqual({});
    expect(changedParcelLimits(card, { max_parcel_weight_grams: 15_000, parcel_size_label: "40 x 30 x 20 cm" })).toEqual({
      max_parcel_weight_grams: 15_000,
    });
    expect(changedParcelLimits(card, { max_parcel_weight_grams: 10_000, parcel_size_label: "big" })).toEqual({
      parcel_size_label: "big",
    });
  });

  it("writes a card's limits on one line, and nothing for a ride card", () => {
    expect(limitsText({ max_parcel_weight_grams: 10_000, parcel_size_label: "40 x 30 x 20 cm" })).toBe(
      "up to 10 kg · 40 x 30 x 20 cm",
    );
    expect(limitsText({ max_parcel_weight_grams: null, parcel_size_label: "" })).toBe("");
  });
});
