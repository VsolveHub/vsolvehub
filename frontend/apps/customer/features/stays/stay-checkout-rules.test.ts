import { describe, expect, it } from "vitest";

import {
  hideSoldOutStayCards,
  holdGuestCount,
  publishedDurationModes,
  shouldShowDurationToggle,
  shouldShowOccupantPicker,
} from "./stay-checkout-rules";

describe("stay checkout rules", () => {
  it("does not invent Monthly/Weekly/Nightly when the partner published one mode", () => {
    expect(publishedDurationModes(undefined, "MONTHLY")).toEqual(["MONTHLY"]);
    expect(shouldShowDurationToggle(publishedDurationModes(["MONTHLY"]))).toBe(false);
    expect(publishedDurationModes(["MONTHLY", "NIGHTLY", "DAILY"])).toEqual(["MONTHLY", "NIGHTLY"]);
  });

  it("treats SHARED occupancy as one guest and hides the occupant picker", () => {
    expect(shouldShowOccupantPicker("SHARED")).toBe(false);
    expect(holdGuestCount("SHARED", 4)).toBe(1);
    expect(shouldShowOccupantPicker("HOTEL_ROOM")).toBe(true);
    expect(holdGuestCount("HOTEL_ROOM", 2)).toBe(2);
  });

  it("hides zero-available unit types once stay dates are set", () => {
    const cards = [
      { unit_type_id: "open", units_available: 2 },
      { unit_type_id: "sold", units_available: 0 },
    ];
    expect(hideSoldOutStayCards(cards, false)).toHaveLength(2);
    expect(hideSoldOutStayCards(cards, true).map((c) => c.unit_type_id)).toEqual(["open"]);
  });
});
