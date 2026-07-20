import { describe, expect, it } from "vitest";
import { cartTotalPaise, summarizeCheckout } from "./summary";

describe("cartTotalPaise", () => {
  it("sums quoted amounts", () => {
    expect(cartTotalPaise([{ quotedAmount: 49900 }, { quotedAmount: 12000 }])).toBe(61900);
  });
  it("is zero for an empty cart", () => {
    expect(cartTotalPaise([])).toBe(0);
  });
});

describe("summarizeCheckout", () => {
  it("maps an assigned item to an assigned outcome with the partner name", () => {
    expect(
      summarizeCheckout([{ bookingRef: "VSH-1", serviceName: "Deep Clean", assigned: true, partnerName: "Asha" }]),
    ).toEqual([{ bookingRef: "VSH-1", serviceName: "Deep Clean", outcome: "assigned", partnerName: "Asha" }]);
  });
  it("maps a failed item to a no_provider outcome carrying the refunded flag", () => {
    expect(
      summarizeCheckout([{ bookingRef: "VSH-2", serviceName: "Wiring", assigned: false, refunded: true }]),
    ).toEqual([{ bookingRef: "VSH-2", serviceName: "Wiring", outcome: "no_provider", refunded: true }]);
  });
  it("defaults refunded to false when a failed item did not refund", () => {
    expect(summarizeCheckout([{ bookingRef: "VSH-3", serviceName: "X", assigned: false }])[0]).toEqual({
      bookingRef: "VSH-3",
      serviceName: "X",
      outcome: "no_provider",
      refunded: false,
    });
  });
});
