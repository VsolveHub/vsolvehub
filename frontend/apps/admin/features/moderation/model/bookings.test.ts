import { describe, expect, it } from "vitest";

import {
  addressLine,
  canCancelRental,
  canCancelStay,
  matchesSearch,
  rupeesToPaise,
} from "./bookings";

describe("booking rules", () => {
  it("offers a rental cancel only before handover", () => {
    expect(canCancelRental("AWAITING_TRANSPORT_QUOTE")).toBe(true);
    expect(canCancelRental("CONFIRMED")).toBe(true);
    expect(canCancelRental("HANDOVER")).toBe(false);
    expect(canCancelRental("DISPUTED")).toBe(false);
    expect(canCancelRental(undefined)).toBe(false);
  });

  it("offers a stay cancel only before check-in", () => {
    expect(canCancelStay("CONFIRMED")).toBe(true);
    expect(canCancelStay("CHECKED_IN")).toBe(false);
    expect(canCancelStay("CANCELLED")).toBe(false);
  });

  it("reads a delivery address as one line", () => {
    expect(addressLine({ line: "12 MG Road", area: "Kukatpally", city: "Hyderabad", pincode: "500072" })).toBe(
      "12 MG Road, Kukatpally, Hyderabad, 500072",
    );
    expect(addressLine(null)).toBe("");
    expect(addressLine("Plain text")).toBe("Plain text");
  });

  it("searches names, phones and ids", () => {
    expect(matchesSearch("ravi", ["Ravi Kumar", null])).toBe(true);
    expect(matchesSearch("9876", ["+919876500000"])).toBe(true);
    expect(matchesSearch("zzz", ["Ravi"])).toBe(false);
    expect(matchesSearch("  ", ["anything"])).toBe(true);
  });

  it("turns rupees into paise and refuses anything else", () => {
    expect(rupeesToPaise("499")).toBe(49900);
    expect(rupeesToPaise("12.5")).toBe(1250);
    expect(rupeesToPaise("-1")).toBeNull();
    expect(rupeesToPaise("1.234")).toBeNull();
    expect(rupeesToPaise("")).toBeNull();
  });
});
