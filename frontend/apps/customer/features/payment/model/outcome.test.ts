import { describe, expect, it } from "vitest";

import {
  canHandOff,
  canReconcile,
  isAmbiguous,
  isExpired,
  isNotCharged,
  isPaid,
  isSettled,
  paymentPhase,
  type PaymentAttempt,
} from "./outcome";

const SERVER_NOW = new Date("2026-08-04T12:00:00.000Z");

function attempt(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    checkout_id: "22222222-2222-2222-2222-222222222222",
    booking_group_id: "33333333-3333-3333-3333-333333333333",
    quote_id: "44444444-4444-4444-4444-444444444444",
    purpose: "BOOKING_GROUP",
    provider: "razorpay",
    provider_public_key: "rzp_test_key",
    provider_order_id: "order_abc123",
    status: "CREATED",
    reconciliation_state: "PENDING",
    failure_code: "",
    version: 1,
    amount: { amount_paise: 250000, currency: "INR" },
    expires_at: "2026-08-04T12:10:00.000Z",
    allocations: [],
    created_at: "2026-08-04T11:55:00.000Z",
    updated_at: "2026-08-04T11:55:00.000Z",
    ...overrides,
  } as PaymentAttempt;
}

describe("isSettled", () => {
  it("keeps polling while the provider has not reported", () => {
    expect(isSettled(attempt({ status: "PROVIDER_PENDING" }))).toBe(false);
    expect(isSettled(attempt({ status: "CREATED" }))).toBe(false);
  });

  it("stops polling on a delivered provider outcome", () => {
    for (const status of ["CAPTURED", "FAILED", "EXPIRED", "REFUNDED"] as const) {
      expect(isSettled(attempt({ status }))).toBe(true);
    }
  });

  it("reopens a settled attempt that Django says needs attention", () => {
    // Django's record and the provider's disagree and it is working on it. A
    // screen that stopped polling here would freeze on the wrong answer.
    expect(isSettled(attempt({ status: "CAPTURED", reconciliation_state: "NEEDS_ATTENTION" }))).toBe(
      false,
    );
  });
});

describe("isPaid", () => {
  it("is true only once the money actually moved", () => {
    expect(isPaid(attempt({ status: "CAPTURED" }))).toBe(true);
    // Refunded still means it was captured first; the booking was paid for.
    expect(isPaid(attempt({ status: "REFUNDED" }))).toBe(true);
    expect(isPaid(attempt({ status: "PARTIALLY_REFUNDED" }))).toBe(true);
  });

  it("is NOT true for an authorization", () => {
    // The regression that matters most. An authorized-but-uncaptured attempt is
    // a hold on the customer's account against a booking that has not happened.
    expect(isPaid(attempt({ status: "AUTHORIZED" }))).toBe(false);
  });

  it("is not true for a live or failed attempt", () => {
    expect(isPaid(attempt({ status: "CREATED" }))).toBe(false);
    expect(isPaid(attempt({ status: "FAILED" }))).toBe(false);
  });
});

describe("isNotCharged", () => {
  it("covers the outcomes where money definitively did not move", () => {
    expect(isNotCharged(attempt({ status: "FAILED" }))).toBe(true);
    expect(isNotCharged(attempt({ status: "EXPIRED" }))).toBe(true);
    expect(isNotCharged(attempt({ status: "AUTHORIZED" }))).toBe(false);
  });
});

describe("isAmbiguous / canReconcile", () => {
  it("treats an authorization as unresolved", () => {
    expect(isAmbiguous(attempt({ status: "AUTHORIZED" }))).toBe(true);
  });

  it("treats a reconciliation flag as unresolved whatever the status says", () => {
    expect(isAmbiguous(attempt({ status: "FAILED", reconciliation_state: "NEEDS_ATTENTION" }))).toBe(
      true,
    );
  });

  it("is settled when Django and the provider agree", () => {
    expect(isAmbiguous(attempt({ status: "CAPTURED", reconciliation_state: "IN_SYNC" }))).toBe(
      false,
    );
  });

  it("offers reconcile only for ambiguity", () => {
    expect(canReconcile(attempt({ status: "AUTHORIZED" }))).toBe(true);
    // Asking the provider a question it already answered.
    expect(canReconcile(attempt({ status: "CAPTURED", reconciliation_state: "IN_SYNC" }))).toBe(
      false,
    );
    // Pressing this repeatedly will not turn a failure into a success.
    expect(canReconcile(attempt({ status: "FAILED", reconciliation_state: "IN_SYNC" }))).toBe(false);
  });
});

describe("isExpired", () => {
  it("uses the server clock, not the device clock", () => {
    const live = attempt({ expires_at: "2026-08-04T12:10:00.000Z" });
    expect(isExpired(live, SERVER_NOW)).toBe(false);
    // A device an hour fast must not decide a live payment is over.
    expect(isExpired(live, new Date("2026-08-04T13:00:00.000Z"))).toBe(true);
  });

  it("never expires an attempt with no published deadline", () => {
    expect(isExpired(attempt({ expires_at: null }), SERVER_NOW)).toBe(false);
  });
});

describe("canHandOff", () => {
  it("allows the widget for a live, unexpired, fully described attempt", () => {
    expect(canHandOff(attempt(), SERVER_NOW)).toBe(true);
  });

  it("refuses when the provider did not give us what its widget needs", () => {
    expect(canHandOff(attempt({ provider_public_key: null }), SERVER_NOW)).toBe(false);
    expect(canHandOff(attempt({ provider_order_id: "" }), SERVER_NOW)).toBe(false);
  });

  it("refuses once the attempt is settled or its window has closed", () => {
    expect(canHandOff(attempt({ status: "CAPTURED" }), SERVER_NOW)).toBe(false);
    expect(
      canHandOff(attempt({ expires_at: "2026-08-04T11:00:00.000Z" }), SERVER_NOW),
    ).toBe(false);
  });
});

describe("paymentPhase", () => {
  it("reports a capture that landed just before its own expiry as paid", () => {
    // Ordering regression: the customer whose money moved must never be told
    // their payment window expired.
    const raced = attempt({ status: "CAPTURED", expires_at: "2026-08-04T11:59:00.000Z" });
    expect(paymentPhase(raced, SERVER_NOW)).toBe("paid");
  });

  it("prefers ambiguity over a not-charged claim", () => {
    const flagged = attempt({ status: "FAILED", reconciliation_state: "NEEDS_ATTENTION" });
    expect(paymentPhase(flagged, SERVER_NOW)).toBe("ambiguous");
  });

  it("maps the live states", () => {
    expect(paymentPhase(attempt({ status: "PROVIDER_PENDING" }), SERVER_NOW)).toBe("preparing");
    expect(paymentPhase(attempt(), SERVER_NOW)).toBe("awaiting-customer");
    expect(paymentPhase(attempt({ provider_public_key: null }), SERVER_NOW)).toBe(
      "awaiting-provider",
    );
  });

  it("maps the terminal states", () => {
    expect(paymentPhase(attempt({ status: "FAILED" }), SERVER_NOW)).toBe("not-charged");
    expect(paymentPhase(attempt({ expires_at: "2026-08-04T11:00:00.000Z" }), SERVER_NOW)).toBe(
      "expired",
    );
  });
});
