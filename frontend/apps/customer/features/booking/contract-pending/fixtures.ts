import { fixtures } from "@vsolve/testing";

import type {
  ProposedCancellationPolicy,
  ProposedCart,
  ProposedCartItem,
  ProposedCheckoutSession,
  ProposedQuote,
  ProposedWindow,
  ProposedWindowDay,
  ProposedWindows,
} from "./types";

/**
 * Fixtures for the proposed endpoints.
 *
 * Values match the examples in
 * `contracts/proposals/0003-m1-booking-and-contract-drift.md` and the frozen
 * amounts in `Django_Next.js_Plan/M1/05-initial-configuration.md`. Backend
 * contract tests and frontend mock tests should share one set of examples, and
 * until the endpoints are published the proposal *is* the shared document. When
 * these diverge, the proposal wins and this file is wrong.
 *
 * Defaults are realistic rather than idealised: a fixture where every Partner
 * has a photo produces a UI that assumes one.
 */

/** Re-exported so the booking fixtures share one clock with the contract ones. */
const FIXED_NOW = fixtures.FIXED_NOW;
const money = fixtures.money;

function iso(offsetSeconds: number, from: string = FIXED_NOW): string {
  return new Date(Date.parse(from) + offsetSeconds * 1000).toISOString();
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 24 * HOUR;

export function bookingWindow(
  overrides: Partial<ProposedWindow> = {},
): ProposedWindow {
  return {
    id: "win_01J8ZQ2K3M4N5P6Q7R8S9T",
    starts_at: iso(3 * HOUR),
    // 60-minute arrival windows, per the frozen M1 configuration.
    ends_at: iso(4 * HOUR),
    is_available: true,
    ...overrides,
  };
}

/**
 * A day carrying a bookable window and one refused for being too soon.
 *
 * The unavailable one is present deliberately: the endpoint returns them rather
 * than omitting them so the UI can render a disabled window instead of a gap,
 * and a fixture with only bookable windows would never exercise that. `TOO_SOON`
 * specifically, because the 120-minute Today lead time is the reason a customer
 * will most often meet.
 */
export function windowDay(
  overrides: Partial<ProposedWindowDay> = {},
): ProposedWindowDay {
  return {
    date: "2026-07-30",
    is_today: true,
    has_availability: true,
    windows: [
      bookingWindow(),
      bookingWindow({
        id: "win_01J8ZQ2K3M4N5P6Q7R8SA0",
        starts_at: iso(1 * HOUR),
        ends_at: iso(2 * HOUR),
        is_available: false,
        unavailable_reason: "TOO_SOON",
      }),
    ],
    ...overrides,
  };
}

export function windows(overrides: Partial<ProposedWindows> = {}): ProposedWindows {
  return {
    server_now: FIXED_NOW,
    estimated_duration_minutes: 60,
    days: [
      windowDay(),
      windowDay({
        date: "2026-07-31",
        is_today: false,
        has_availability: false,
        windows: [],
      }),
      ...Array.from({ length: 5 }, (_, index) =>
        windowDay({
          date: new Date(Date.parse(FIXED_NOW) + (index + 2) * DAY * 1000)
            .toISOString()
            .slice(0, 10),
          is_today: false,
          windows: [
            bookingWindow({
              id: `win_day${index + 2}`,
              starts_at: iso((index + 2) * DAY + 3 * HOUR),
              ends_at: iso((index + 2) * DAY + 4 * HOUR),
            }),
          ],
        }),
      ),
    ],
    ...overrides,
  };
}

/**
 * The M1 cancellation ladder, with the frozen fixed fees.
 *
 * ₹0 / ₹49 / ₹99 / ₹149 from
 * `M1/05-initial-configuration.md`. Fixed amounts rather than percentages,
 * because ADR-022 makes cancellation cost recovery rather than a share of the
 * booking.
 */
export function cancellationPolicy(): ProposedCancellationPolicy {
  return {
    policy_version: "m1-2026-07-31",
    bands: [
      {
        code: "GT_24H",
        condition_text: "More than 24 hours before your arrival window",
        fee: money(0),
      },
      {
        code: "LT_24H_GT_2H",
        condition_text: "24 to 2 hours before your arrival window",
        fee: money(4900),
      },
      {
        code: "LT_2H",
        condition_text: "Less than 2 hours before, and before they arrive",
        fee: money(9900),
      },
      {
        code: "AFTER_ARRIVAL",
        condition_text: "Once your professional has arrived and waited",
        fee: money(14900),
      },
    ],
  };
}

/**
 * A quote for one ₹249 fan installation.
 *
 * The task total exceeds the ₹199 minimum, so the top-up line is zero and
 * present — the line always appears so the rule stays visible, which is what
 * makes an unreachable "starts at" price impossible.
 */
export function quote(overrides: Partial<ProposedQuote> = {}): ProposedQuote {
  return {
    id: "quote_01J8ZQ2K3M4N5P6Q7R8SC2",
    version: 1,
    expires_at: iso(15 * MINUTE),
    server_now: FIXED_NOW,
    estimated_duration_minutes: 60,
    lines: [
      {
        code: "task.fan-installation",
        label: "Fan installation × 1",
        amount: money(24900),
      },
      {
        code: "minimum_visit_topup",
        label: "Minimum visit charge",
        amount: money(0),
      },
    ],
    subtotal: money(24900),
    platform_fee: { label: "Platform fee", amount: money(0) },
    tax: { label: "GST 18%", amount: money(4482) },
    total: money(29382),
    cancellation_policy: cancellationPolicy(),
    ...overrides,
  };
}

/**
 * A checkout session mid-search.
 *
 * Defaults to `FINDING_PARTNER` with no Partner disclosed and no payment
 * timestamps — the state the customer spends the most time in, and the one where
 * getting disclosure wrong would leak a name. Tests for the committed and
 * exhausted states override explicitly.
 */
export function checkoutSession(
  overrides: Partial<ProposedCheckoutSession> = {},
): ProposedCheckoutSession {
  return {
    reference: "cs_01J8ZQ2K3M4N5P6Q7R8SD3",
    status: "FINDING_PARTNER",
    server_now: FIXED_NOW,
    // Whole-search deadline: 180 seconds.
    search_deadline_at: iso(180),
    partner: null,
    payment_enabled_at: null,
    reservation_expires_at: null,
    no_partner_alternatives: [],
    ...overrides,
  };
}

/** A session where a Partner accepted and their 120-second undo window has closed. */
export function committedCheckoutSession(
  overrides: Partial<ProposedCheckoutSession> = {},
): ProposedCheckoutSession {
  return checkoutSession({
    status: "PARTNER_COMMITTED",
    search_deadline_at: null,
    partner: {
      display_name: "Ramesh K.",
      // Null by default: most Partners have not uploaded one.
      photo_url: null,
      skill_badge: "Electrical",
    },
    payment_enabled_at: iso(-1),
    // 5-minute payment window.
    reservation_expires_at: iso(5 * MINUTE),
    ...overrides,
  });
}

export function cartItem(overrides: Partial<ProposedCartItem> = {}): ProposedCartItem {
  return {
    id: "5e8d2a14-9c37-4f60-b2a8-7d1e4c9f0b63",
    service_variant_id: "8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83",
    service_slug: "fan-installation",
    task_lines: [{ task_code: "fan-installation", quantity: 1 }],
    address_id: "77777777-7777-4777-8777-777777777777",
    window_id: null,
    scope: [],
    notes: "",
    ...overrides,
  };
}

export function cart(overrides: Partial<ProposedCart> = {}): ProposedCart {
  return {
    id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    items: [cartItem()],
    server_now: FIXED_NOW,
    ...overrides,
  };
}
