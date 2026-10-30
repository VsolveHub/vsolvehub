import { describe, expect, it } from "vitest";

import {
  CHECKOUT_TIMEOUT_MARGIN_SECONDS,
  checkoutTimeoutSeconds,
  handoffTarget,
  isInteractiveProvider,
} from "./provider-handoff";
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
      expiresAt: null,
    });
  });

  it("carries the attempt's server deadline for the Checkout timeout", () => {
    const target = handoffTarget(attempt({ expires_at: "2026-08-04T12:00:00.000Z" }));
    expect(target?.expiresAt).toBe("2026-08-04T12:00:00.000Z");
  });

  it("prefers razorpay_amount_paise (gateway net) over gross amount", () => {
    const target = handoffTarget(
      attempt({
        amount: { amount_paise: 250000, currency: "INR" },
        razorpay_amount_paise: 200000,
      }),
    );
    expect(target?.amountPaise).toBe(200000);
  });

  it("refuses an attempt missing what the widget needs", () => {
    // Opening a widget without these fails inside the provider's own iframe,
    // where we cannot explain it to anyone.
    expect(handoffTarget(attempt({ provider_public_key: null }))).toBeNull();
    expect(handoffTarget(attempt({ provider_order_id: "" }))).toBeNull();
    expect(handoffTarget(attempt({ provider_order_id: "   " }))).toBeNull();
  });

  it("refuses a non-interactive provider even when fully described", () => {
    expect(handoffTarget(attempt({ provider: "fake" }))).toBeNull();
  });
});

describe("checkoutTimeoutSeconds", () => {
  const deadline = "2026-08-04T12:00:00.000Z";
  const deadlineMs = Date.parse(deadline);

  it("closes Checkout the safety margin before the attempt expires", () => {
    // Five minutes left on the hold: Checkout may stay open for 270 seconds.
    expect(checkoutTimeoutSeconds(deadline, deadlineMs - 300_000)).toBe(
      300 - CHECKOUT_TIMEOUT_MARGIN_SECONDS,
    );
  });

  it("rounds a partial second down, never giving Checkout time it does not have", () => {
    expect(checkoutTimeoutSeconds(deadline, deadlineMs - 60_500)).toBe(60 - 30);
  });

  it("reports a closed window as zero or less so Checkout is not opened", () => {
    expect(checkoutTimeoutSeconds(deadline, deadlineMs - 30_000)).toBe(0);
    expect(checkoutTimeoutSeconds(deadline, deadlineMs + 1_000)).toBeLessThan(0);
  });

  it("opens without a timeout when the attempt has no deadline", () => {
    expect(checkoutTimeoutSeconds(null, deadlineMs)).toBeNull();
    expect(checkoutTimeoutSeconds("not a date", deadlineMs)).toBeNull();
  });
});
