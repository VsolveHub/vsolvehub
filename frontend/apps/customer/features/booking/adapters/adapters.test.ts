import { describe, expect, it } from "vitest";

import { fixtures } from "@vsolve/testing";

import { checkoutSession, committedCheckoutSession } from "../contract-pending/fixtures";
import { toCheckoutSessionView } from "./checkout-session";
import { toQuoteView } from "./quote";
import { toWindowView, toWindowsView } from "./windows";

describe("windows adapter", () => {
  it("keeps unavailable windows and labels why", () => {
    // They are rendered disabled rather than omitted, so the customer sees the
    // window exists and is taken instead of a gap they cannot explain.
    const view = toWindowView(
      fixtures.bookingWindow({ is_available: false, unavailable_reason: "NO_CAPACITY" }),
    );
    expect(view.isAvailable).toBe(false);
    expect(view.unavailableLabel).toBe("No pros available");
  });

  it("names the Today lead time rather than saying only 'unavailable'", () => {
    // A customer refused for booking too soon must be able to tell that from a
    // customer refused because nobody is free.
    const view = toWindowView(
      fixtures.bookingWindow({ is_available: false, unavailable_reason: "TOO_SOON" }),
    );
    expect(view.unavailableLabel).toBe("Too soon to book");
  });

  it("labels an available window with no reason", () => {
    expect(toWindowView(fixtures.bookingWindow()).unavailableLabel).toBeNull();
  });

  it("formats window times in the booking timezone, not the device's", () => {
    // 06:30 UTC is 12:00 noon IST. A device in another timezone must still see
    // the time the professional arrives in Hyderabad.
    const view = toWindowView(
      fixtures.bookingWindow({ starts_at: "2026-07-30T06:30:00Z", ends_at: "2026-07-30T07:30:00Z" }),
    );
    expect(view.label).toBe("12:00 pm – 1:00 pm");
  });

  it("labels today and tomorrow from the server clock", () => {
    const view = toWindowsView(
      fixtures.bookingWindows({
        server_now: "2026-07-30T09:00:00Z",
        days: [
          fixtures.bookingWindowDay({ date: "2026-07-30" }),
          fixtures.bookingWindowDay({ date: "2026-07-31" }),
          fixtures.bookingWindowDay({ date: "2026-08-06" }),
        ],
      }),
    );
    // "Today" and "Tomorrow" are our rule and are asserted exactly. The third
    // label is the locale's business — asserting its punctuation would pin the
    // test to an ICU version rather than to any behaviour we own.
    expect(view.days.slice(0, 2).map((day) => day.label)).toEqual(["Today", "Tomorrow"]);
    expect(view.days[2]?.label).toMatch(/Thu.*6.*Aug/);
  });

  it("reports empty when every returned window is unavailable", () => {
    // A day is bookable exactly when one of its windows is; the published day
    // carries no flag to disagree with, which removes the case entirely.
    const view = toWindowsView(
      fixtures.bookingWindows({
        days: [
          fixtures.bookingWindowDay({
            windows: [
              fixtures.bookingWindow({ is_available: false, unavailable_reason: "NO_CAPACITY" }),
            ],
          }),
        ],
      }),
    );
    expect(view.isEmpty).toBe(true);
  });

  it("is not empty when a bookable window exists", () => {
    expect(toWindowsView(fixtures.bookingWindows()).isEmpty).toBe(false);
  });

  it("carries the server's duration estimate rather than deriving one", () => {
    const view = toWindowsView(fixtures.bookingWindows({ estimated_duration_minutes: 45 }));
    expect(view.estimatedDurationMinutes).toBe(45);
  });
});

describe("quote adapter", () => {
  it("formats the server total rather than summing the lines", () => {
    const view = toQuoteView(fixtures.quote());
    expect(view.totalLabel).toBe("₹293.82");
    expect(view.totalPaise).toBe(29382);
  });

  it("carries the tax label from the server", () => {
    // The frontend must not assert a GST rate.
    expect(toQuoteView(fixtures.quote()).taxLabel).toBe("GST 18%");
  });

  it("renders whichever ladder arrives without knowing its shape", () => {
    const full = toQuoteView(fixtures.quote());
    const policy = fixtures.cancellationPolicy();
    const short = toQuoteView(
      fixtures.quote({
        cancellation_policy: { code: "test-two-band", version: 99, bands: policy.bands.slice(0, 2) },
      }),
    );
    expect(full.cancellationBands).toHaveLength(4);
    expect(short.cancellationBands).toHaveLength(2);
    // Both parts, because a bare number does not identify which terms applied.
    expect(short.cancellationPolicyVersion).toBe("test-two-band v99");
  });

  it("marks free bands", () => {
    const bands = toQuoteView(fixtures.quote()).cancellationBands;
    expect(bands[0]?.isFree).toBe(true);
    expect(bands[1]?.isFree).toBe(false);
  });

  it("keeps a zero minimum-visit line so the rule stays visible", () => {
    // An unreachable "starts at" price is forbidden. The line is always present,
    // even at zero, so the customer can see the minimum exists.
    const codes = toQuoteView(fixtures.quote()).lines.map((line) => line.code);
    expect(codes).toContain("minimum_visit_topup");
  });
});

describe("checkout session adapter", () => {
  it("does not disclose a Partner during the search", () => {
    // An offer is not a commitment. A Partner who declines must never have been
    // named to the customer.
    const view = toCheckoutSessionView(checkoutSession());
    expect(view.phase).toBe("searching");
    expect(view.partnerName).toBeNull();
  });

  it("refuses payment while no Partner has committed", () => {
    const view = toCheckoutSessionView(checkoutSession());
    expect(view.canPay).toBe(false);
    expect(view.payBlockedReason).toBe("NO_PARTNER_YET");
  });

  it("refuses payment while the Partner's undo window is still open", () => {
    // ADR-015: the 120-second no-fault undo. Enabling payment inside it would
    // charge the customer for a job the Partner can still walk away from.
    const view = toCheckoutSessionView(
      committedCheckoutSession({
        server_now: "2026-07-30T09:00:00Z",
        payment_enabled_at: "2026-07-30T09:01:00Z",
        reservation_expires_at: "2026-07-30T09:06:00Z",
      }),
    );
    expect(view.canPay).toBe(false);
    expect(view.payBlockedReason).toBe("UNDO_WINDOW_OPEN");
  });

  it("allows payment once committed and past the undo window", () => {
    const view = toCheckoutSessionView(committedCheckoutSession());
    expect(view.canPay).toBe(true);
    expect(view.payBlockedReason).toBeNull();
    expect(view.partnerName).toBe("Ramesh K.");
  });

  it("refuses payment inside the reservation safety margin", () => {
    // Frozen config: a payment started within 30 seconds of reservation expiry
    // would likely capture against released capacity.
    const view = toCheckoutSessionView(
      committedCheckoutSession({
        server_now: "2026-07-30T09:00:00Z",
        payment_enabled_at: "2026-07-30T08:59:00Z",
        reservation_expires_at: "2026-07-30T09:00:20Z",
      }),
    );
    expect(view.canPay).toBe(false);
    expect(view.payBlockedReason).toBe("RESERVATION_EXPIRING");
  });

  it("refuses payment when a committed session is missing its timestamps", () => {
    // Missing data never resolves in favour of taking money.
    const view = toCheckoutSessionView(
      committedCheckoutSession({ payment_enabled_at: null, reservation_expires_at: null }),
    );
    expect(view.canPay).toBe(false);
  });

  it("counts down to the undo deadline while it is the binding one", () => {
    const view = toCheckoutSessionView(
      committedCheckoutSession({
        server_now: "2026-07-30T09:00:00Z",
        payment_enabled_at: "2026-07-30T09:01:00Z",
        reservation_expires_at: "2026-07-30T09:06:00Z",
      }),
    );
    expect(view.deadlineKind).toBe("undo");
    expect(view.deadlineAt).toBe("2026-07-30T09:01:00Z");
  });

  it("counts down to the reservation once payment is open", () => {
    const view = toCheckoutSessionView(committedCheckoutSession());
    expect(view.deadlineKind).toBe("reservation");
  });

  it("reports exhaustion as a real answer with alternatives", () => {
    const view = toCheckoutSessionView(
      checkoutSession({
        status: "FAILED",
        no_partner_alternatives: [{ code: "WIDER_WINDOW", label: "Try tomorrow morning" }],
      }),
    );
    expect(view.phase).toBe("failed");
    expect(view.alternatives).toHaveLength(1);
    expect(view.canPay).toBe(false);
  });

  it("treats cancelling as free at every pre-payment phase", () => {
    // M1 charges nothing before payment succeeds.
    expect(toCheckoutSessionView(checkoutSession()).canCancelFree).toBe(true);
    expect(toCheckoutSessionView(committedCheckoutSession()).canCancelFree).toBe(true);
  });

  it("does not offer a free cancel once payment is in flight", () => {
    const view = toCheckoutSessionView(checkoutSession({ status: "PAYMENT_PENDING" }));
    expect(view.canCancelFree).toBe(false);
    expect(view.payBlockedReason).toBe("ALREADY_PAID");
  });
});
