import { fixtures } from "@vsolve/testing";

import { checkoutSession, committedCheckoutSession } from "../contract-pending/fixtures";
import { toCheckoutSessionView, type CheckoutSessionView } from "./checkout-session";
import { toQuoteView, type QuoteView } from "./quote";
import { toWindowsView, type WindowsView } from "./windows";

/**
 * View-model fixtures for component tests.
 *
 * Windows and quotes now come from `@vsolve/testing`, built on the published
 * 1.6.0 schemas — the boundary did its job: this file changed and no component
 * test did.
 *
 * Checkout fixtures still come from `../contract-pending/`, because BE-07 has
 * not published that projection. They move the same way when it does.
 */

export function windowsViewFixture(): WindowsView {
  return toWindowsView(fixtures.bookingWindows());
}

/** A range where every returned window is unavailable. */
export function fullyBookedWindowsFixture(): WindowsView {
  return toWindowsView(
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
}

export function quoteViewFixture(): QuoteView {
  return toQuoteView(fixtures.quote());
}

/**
 * A quote whose ladder has a different shape.
 *
 * Used to assert the ladder component renders whatever it is given rather than
 * a hardcoded M1 set — the failure mode being a frontend copy of the policy that
 * goes stale the first time Operations changes a fee.
 */
export function twoBandQuoteViewFixture(): QuoteView {
  const policy = fixtures.cancellationPolicy();
  return toQuoteView(
    fixtures.quote({
      cancellation_policy: {
        code: "test-two-band",
        version: 99,
        bands: policy.bands.slice(0, 2),
      },
    }),
  );
}

/** Mid-search: no Partner disclosed, payment not reachable. */
export function searchingSessionFixture(): CheckoutSessionView {
  return toCheckoutSessionView(checkoutSession());
}

/** A Partner accepted and their undo window closed: payment is open. */
export function committedSessionFixture(): CheckoutSessionView {
  return toCheckoutSessionView(committedCheckoutSession());
}

/** The pool was exhausted; nothing was charged. */
export function exhaustedSessionFixture(): CheckoutSessionView {
  return toCheckoutSessionView(
    checkoutSession({
      status: "FAILED",
      search_deadline_at: null,
      no_partner_alternatives: [
        { code: "WIDER_WINDOW", label: "Try a wider arrival window tomorrow morning" },
      ],
    }),
  );
}
