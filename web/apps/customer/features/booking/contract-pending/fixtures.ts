import { fixtures } from "@vsolve/testing";

import type {
  ProposedAvailability,
  ProposedAvailabilityDay,
  ProposedCancellationLadder,
  ProposedCapacityHold,
  ProposedCart,
  ProposedCartItem,
  ProposedEligiblePartner,
  ProposedEligiblePartners,
  ProposedInstantPreCheck,
  ProposedQuote,
  ProposedSlot,
} from "./types";

/**
 * Fixtures for the proposed endpoints.
 *
 * Values match the examples in `contracts/proposals/0002-booking-workspace.md`
 * exactly. That is the only version of tasks.md §3 rule 8 available before the
 * endpoints exist: backend contract tests and frontend mock tests should share
 * one set of examples, and until Codex publishes them the proposal *is* the
 * shared document. When these diverge, the proposal wins and this file is wrong.
 *
 * Defaults are realistic rather than idealised, following the lesson recorded in
 * proposal 0001: a fixture where every Partner has a photo produces a UI that
 * assumes one.
 */

/** Re-exported so the booking fixtures share one clock with the contract ones. */
const FIXED_NOW = fixtures.FIXED_NOW;
const money = fixtures.money;

function iso(offsetSeconds: number, from: string = FIXED_NOW): string {
  return new Date(Date.parse(from) + offsetSeconds * 1000).toISOString();
}

const HOUR = 3600;
const DAY = 24 * HOUR;

export function slot(overrides: Partial<ProposedSlot> = {}): ProposedSlot {
  return {
    id: "slot_01J8ZQ2K3M4N5P6Q7R8S9T",
    start_at: iso(2 * HOUR),
    end_at: iso(3.5 * HOUR),
    is_available: true,
    ...overrides,
  };
}

/**
 * A day carrying both a bookable and an unavailable window.
 *
 * The unavailable one is present deliberately: the contract returns them rather
 * than omitting them so the UI can render a disabled window instead of a gap,
 * and a fixture with only bookable slots would never exercise that.
 */
export function availabilityDay(
  overrides: Partial<ProposedAvailabilityDay> = {},
): ProposedAvailabilityDay {
  return {
    date: "2026-07-30",
    has_availability: true,
    slots: [
      slot(),
      slot({
        id: "slot_01J8ZQ2K3M4N5P6Q7R8SA0",
        start_at: iso(3.5 * HOUR),
        end_at: iso(5 * HOUR),
        is_available: false,
        unavailable_reason: "FULLY_BOOKED",
      }),
    ],
    ...overrides,
  };
}

export function availability(
  overrides: Partial<ProposedAvailability> = {},
): ProposedAvailability {
  return {
    server_now: FIXED_NOW,
    days: [
      availabilityDay(),
      availabilityDay({
        date: "2026-07-31",
        has_availability: false,
        slots: [],
      }),
      ...Array.from({ length: 5 }, (_, index) =>
        availabilityDay({
          date: new Date(Date.parse(FIXED_NOW) + (index + 2) * DAY * 1000)
            .toISOString()
            .slice(0, 10),
          slots: [
            slot({
              id: `slot_day${index + 2}`,
              start_at: iso((index + 2) * DAY + 3 * HOUR),
              end_at: iso((index + 2) * DAY + 4.5 * HOUR),
            }),
          ],
        }),
      ),
    ],
    ...overrides,
  };
}

export function eligiblePartner(
  overrides: Partial<ProposedEligiblePartner> = {},
): ProposedEligiblePartner {
  return {
    id: "9c4e1b70-5a2f-4d38-8e19-3b6c0f7a2d54",
    display_name: "Ramesh K.",
    // Null by default: most Partners have not uploaded one, and a fixture that
    // always has a photo produces a layout that breaks on the real roster.
    photo_url: null,
    rating: "4.7",
    rating_count: 213,
    completed_jobs: 240,
    skill_badge: "Electrical",
    previously_booked: false,
    price_difference: null,
    availability_text: "Available at 11:00 am",
    ...overrides,
  };
}

export function eligiblePartners(
  overrides: Partial<ProposedEligiblePartners> = {},
): ProposedEligiblePartners {
  return {
    server_now: FIXED_NOW,
    auto_assign_available: true,
    partners: [
      eligiblePartner(),
      eligiblePartner({
        id: "b7d301e2-4c85-4a19-9f31-6e2b8d05c4a7",
        display_name: "Suresh B.",
        rating: "4.9",
        rating_count: 88,
        completed_jobs: 96,
        previously_booked: true,
        price_difference: money(5000),
        availability_text: "Available at 11:30 am",
      }),
    ],
    ...overrides,
  };
}

export function capacityHold(
  overrides: Partial<ProposedCapacityHold> = {},
): ProposedCapacityHold {
  return {
    id: "hold_01J8ZQ2K3M4N5P6Q7R8SB1",
    cart_item_id: "5e8d2a14-9c37-4f60-b2a8-7d1e4c9f0b63",
    partner_id: "9c4e1b70-5a2f-4d38-8e19-3b6c0f7a2d54",
    slot_id: "slot_01J8ZQ2K3M4N5P6Q7R8S9T",
    expires_at: iso(8 * 60),
    server_now: FIXED_NOW,
    ...overrides,
  };
}

export function instantPreCheck(
  overrides: Partial<ProposedInstantPreCheck> = {},
): ProposedInstantPreCheck {
  return {
    server_now: FIXED_NOW,
    can_dispatch: true,
    reason_code: null,
    estimated_arrival_text: "Usually 25–40 minutes",
    ...overrides,
  };
}

/** The Scheduled ladder from doc 11 §5.3, in rupees for the fixture's total. */
export function scheduledCancellationLadder(): ProposedCancellationLadder {
  return {
    policy_version: "scheduled-v1",
    bands: [
      {
        code: "A",
        condition_text: "More than 24 hours before your slot",
        refund_amount: money(48144),
        fee_amount: money(0),
      },
      {
        code: "B",
        condition_text: "Between 24 and 2 hours before your slot",
        refund_amount: money(33701),
        fee_amount: money(14443),
      },
      {
        code: "C",
        condition_text: "Less than 2 hours before your slot",
        refund_amount: money(0),
        fee_amount: money(48144),
      },
    ],
  };
}

/**
 * The Instant ladder from doc 11 §5.1 — five bands, not three.
 *
 * Kept as a separate builder rather than a parameter because the shapes differ
 * in kind: Instant bands are keyed on booking state (band B is unconditional
 * whenever no Partner is assigned) while Scheduled bands are keyed on time
 * before the slot. Any UI that renders one correctly must render the other from
 * the same envelope without knowing which it received.
 */
export function instantCancellationLadder(): ProposedCancellationLadder {
  return {
    policy_version: "instant-v1",
    bands: [
      {
        code: "A",
        condition_text: "Within 10 minutes of payment, before your professional sets off",
        refund_amount: money(48144),
        fee_amount: money(0),
      },
      {
        code: "B",
        condition_text: "Any time before a professional is assigned",
        refund_amount: money(48144),
        fee_amount: money(0),
      },
      {
        code: "C",
        condition_text: "After a professional confirms, before they set off",
        refund_amount: money(24072),
        fee_amount: money(24072),
      },
      {
        code: "D",
        condition_text: "Once your professional is on the way",
        refund_amount: money(0),
        fee_amount: money(48144),
      },
      {
        code: "E",
        condition_text: "If nobody is there when your professional arrives",
        refund_amount: money(38144),
        fee_amount: money(10000),
      },
    ],
  };
}

export function quote(overrides: Partial<ProposedQuote> = {}): ProposedQuote {
  return {
    id: "quote_01J8ZQ2K3M4N5P6Q7R8SC2",
    version: 3,
    expires_at: iso(15 * 60),
    server_now: FIXED_NOW,
    fulfilment_type: "SCHEDULED",
    lines: [
      {
        code: "service",
        label: "Switch / Socket Repair — 90 minutes",
        amount: money(29900),
      },
      {
        code: "scope_extra",
        label: "Additional socket point (×2)",
        amount: money(8000),
      },
    ],
    subtotal: money(37900),
    platform_fee: { label: "Platform fee", amount: money(2900) },
    tax: { label: "GST 18%", amount: money(7344) },
    total: money(48144),
    cancellation_ladder: scheduledCancellationLadder(),
    ...overrides,
  };
}

export function cartItem(overrides: Partial<ProposedCartItem> = {}): ProposedCartItem {
  return {
    id: "5e8d2a14-9c37-4f60-b2a8-7d1e4c9f0b63",
    service_variant_id: "8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83",
    service_slug: "switch-socket-repair",
    fulfilment_type: "SCHEDULED",
    quantity: 1,
    duration_minutes: 90,
    address_id: "77777777-7777-4777-8777-777777777777",
    slot_id: null,
    partner_id: null,
    capacity_hold_id: null,
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
