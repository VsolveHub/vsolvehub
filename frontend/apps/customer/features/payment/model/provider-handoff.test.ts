import { describe, expect, it } from "vitest";

import { handoffTarget, isInteractiveProvider } from "./provider-handoff";
import type { PaymentAttempt } from "./outcome";

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
    expires_at: null,
    allocations: [],
    created_at: "2026-08-04T11:55:00.000Z",
    updated_at: "2026-08-04T11:55:00.000Z",
    ...overrides,
  } as PaymentAttempt;
}

describe("isInteractiveProvider", () => {
  it("recognises the one provider with a widget", () => {
    expect(isInteractiveProvider("razorpay")).toBe(true);
  });

  it("does NOT treat the fake provider as interactive", () => {
    // The fake provider exists for backend tests and local capture. Giving it a
    // customer-facing button would ship a control that fabricates a financial
    // outcome in the production bundle.
    expect(isInteractiveProvider("fake")).toBe(false);
  });

  it("refuses a provider this client has never heard of", () => {
    expect(isInteractiveProvider("stripe")).toBe(false);
    expect(isInteractiveProvider("")).toBe(false);
  });
});

describe("handoffTarget", () => {
  it("carries the server's own key, order and amount", () => {
    const target = handoffTarget(attempt());

    expect(target).toEqual({
      provider: "razorpay",
      publicKey: "rzp_test_key",
      providerOrderId: "order_abc123",
      amountPaise: 250000,
      currency: "INR",
    });
  });

  it("refuses an attempt missing what the widget needs", () => {
    // Opening a widget without these fails inside the provider's own iframe,
    // where we cannot explain it to anyone.
    expect(handoffTarget(attempt({ provider_public_key: null }))).toBeNull();
    expect(handoffTarget(attempt({ provider_order_id: "" }))).toBeNull();
  });

  it("refuses a non-interactive provider even when fully described", () => {
    expect(handoffTarget(attempt({ provider: "fake" }))).toBeNull();
  });
});
