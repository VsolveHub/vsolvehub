import { describe, expect, it } from "vitest";

import {
  bookingActionLabel,
  canSubmitAsset,
  partnerBookingAction,
} from "./booking-actions";

describe("partnerBookingAction", () => {
  it("offers handover when CONFIRMED", () => {
    expect(partnerBookingAction("CONFIRMED", "HELD")).toBe("handover");
  });

  it("offers return when HANDOVER", () => {
    expect(partnerBookingAction("HANDOVER", "HELD")).toBe("return");
  });

  it("offers release-deposit when RETURNED and deposit held", () => {
    expect(partnerBookingAction("RETURNED", "HELD")).toBe("release-deposit");
    expect(partnerBookingAction("RETURNED", "AUTHORIZED")).toBe("release-deposit");
  });

  it("hides release when deposit already released", () => {
    expect(partnerBookingAction("RETURNED", "RELEASED")).toBeNull();
  });

  it("offers nothing for pending payment or cancelled", () => {
    expect(partnerBookingAction("PENDING_PAYMENT", "REQUESTED")).toBeNull();
    expect(partnerBookingAction("CANCELLED", "HELD")).toBeNull();
  });
});

describe("bookingActionLabel", () => {
  it("labels each action for the button", () => {
    expect(bookingActionLabel("handover")).toBe("Handover");
    expect(bookingActionLabel("return")).toBe("Return");
    expect(bookingActionLabel("release-deposit")).toBe("Release deposit");
  });
});

describe("canSubmitAsset", () => {
  it("allows draft and rejected only", () => {
    expect(canSubmitAsset("DRAFT")).toBe(true);
    expect(canSubmitAsset("REJECTED")).toBe(true);
    expect(canSubmitAsset("PENDING")).toBe(false);
    expect(canSubmitAsset("APPROVED")).toBe(false);
  });
});
