import {
  bookingWindow,
  cancellationPolicy,
  checkoutSession,
  committedCheckoutSession,
  quote,
  windowDay,
  windows,
} from "../contract-pending/fixtures";
import { toCheckoutSessionView, type CheckoutSessionView } from "./checkout-session";
import { toQuoteView, type QuoteView } from "./quote";
import { toWindowsView, type WindowsView } from "./windows";

/**
 * View-model fixtures for component tests.
 *
 * Component tests need realistic data, but importing the pending fixtures
 * directly would put them on the wrong side of the quarantine boundary — and
 * then publishing the real contract would force every component test to change,
 * which is exactly what the boundary exists to prevent.
 *
 * So the fixtures are converted here, inside the adapter layer, where knowing
 * the pending shapes is the job. On integration this file is rewritten with
 * everything else in `../adapters/`, and the component tests are untouched.
 */

export function windowsViewFixture(): WindowsView {
  return toWindowsView(windows());
}

/** A range where every returned window is unavailable. */
export function fullyBookedWindowsFixture(): WindowsView {
  return toWindowsView(
    windows({
      days: [
        windowDay({
          windows: [
            bookingWindow({ is_available: false, unavailable_reason: "NO_CAPACITY" }),
          ],
        }),
      ],
    }),
  );
}

export function quoteViewFixture(): QuoteView {
  return toQuoteView(quote());
}

/**
 * A quote whose ladder has a different shape.
 *
 * Used to assert the ladder component renders whatever it is given rather than
 * a hardcoded M1 set — the failure mode being a frontend copy of the policy that
 * goes stale the first time Operations changes a fee.
 */
export function twoBandQuoteViewFixture(): QuoteView {
  const policy = cancellationPolicy();
  return toQuoteView(
    quote({
      cancellation_policy: {
        policy_version: "test-two-band",
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
