import { createTranslator } from "@vsolve/ui";
import { describe, expect, it } from "vitest";

import { catalogs } from "@/i18n/catalogs";

import {
  bookingActionLabel,
  canCancelBooking,
  canDisputeDeposit,
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

describe("canCancelBooking", () => {
  it("allows cancel before handover", () => {
    expect(canCancelBooking("AWAITING_TRANSPORT_QUOTE")).toBe(true);
    expect(canCancelBooking("PENDING_PAYMENT")).toBe(true);
    expect(canCancelBooking("CONFIRMED")).toBe(true);
  });

  it("hides cancel after handover", () => {
    expect(canCancelBooking("HANDOVER")).toBe(false);
    expect(canCancelBooking("RETURNED")).toBe(false);
    expect(canCancelBooking("CANCELLED")).toBe(false);
  });
});

describe("canDisputeDeposit", () => {
  it("offers dispute when RETURNED and deposit held", () => {
    expect(canDisputeDeposit("RETURNED", "HELD")).toBe(true);
    expect(canDisputeDeposit("RETURNED", "AUTHORIZED")).toBe(true);
  });

  it("hides dispute otherwise", () => {
    expect(canDisputeDeposit("RETURNED", "RELEASED")).toBe(false);
    expect(canDisputeDeposit("HANDOVER", "HELD")).toBe(false);
  });
});

describe("bookingActionLabel", () => {
  const { t } = createTranslator("en-IN", catalogs["en-IN"]);
  it("labels each action for the button", () => {
    expect(bookingActionLabel("handover", t)).toBe("Handover");
    expect(bookingActionLabel("return", t)).toBe("Return");
    expect(bookingActionLabel("release-deposit", t)).toBe("Return deposit");
    expect(bookingActionLabel("dispute-deposit", t)).toBe("Raise dispute");
    expect(bookingActionLabel("cancel", t)).toBe("Cancel booking");
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
