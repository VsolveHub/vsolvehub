// Ported from frontend/apps/customer/features/bookings/fixtures.ts
import type { Schemas } from "@vsolve/api-client";

/**
 * Contract-shaped Booking Group fixtures.
 *
 * Annotated with the generated types, so a field the client invents, renames or
 * drops is a compile error rather than a test that passes against a shape Django
 * never sends.
 */

export function money(amountPaise: number): Schemas["Money"] {
  return { amount_paise: amountPaise, currency: "INR" };
}

export function unitLine(overrides: Partial<Schemas["FulfilmentUnitLine"]> = {}) {
  return {
    id: "unit-line-1",
    position: 0,
    kind: "SERVICE",
    code: "task.fan-installation",
    label: "Fan installation",
    quantity: 1,
    amount: money(24900),
    ...overrides,
  } satisfies Schemas["FulfilmentUnitLine"];
}

export function unit(overrides: Partial<Schemas["FulfilmentUnit"]> = {}) {
  return {
    id: "fu-1",
    position: 0,
    status: "MATCHING",
    version: 1,
    starts_at: "2026-08-04T10:00:00Z",
    arrival_window_minutes: 60,
    estimated_duration_minutes: 45,
    state_deadline: null,
    // Null while the unit is `MATCHING`: there is no visit to open until the
    // group has been paid for. A test wanting the "Track this visit" link
    // supplies both a booked status and an id, so the two cannot drift apart.
    booking_id: null,
    // Null for the same reason `booking_id` is: nobody is assigned until the
    // group has been paid for, and a fixture that names a professional early
    // would let a test assert a card the product must not render.
    booking_status: null,
    professional: null,
    lines: [unitLine()],
    total: money(31742),
    ...overrides,
  } satisfies Schemas["FulfilmentUnit"];
}

export function group(overrides: Partial<Schemas["BookingGroup"]> = {}) {
  return {
    id: "group-1",
    status: "MATCHING",
    version: 1,
    confirmation_policy: "ALL_OR_NOTHING",
    expires_at: "2026-08-03T09:30:00Z",
    server_now: "2026-08-03T09:00:00Z",
    recovery_action: "WAIT",
    next_transition_at: "2026-08-03T09:05:00Z",
    // Contract 1.14.0. A group carries its own checkout so payment is reachable
    // after a reload or from another device; `order_id` is null until capture.
    checkout_id: "checkout-1",
    checkout_version: 1,
    order_id: null,
    units: [unit()],
    created_at: "2026-08-03T09:00:00Z",
    updated_at: "2026-08-03T09:00:00Z",
    ...overrides,
  } satisfies Schemas["BookingGroup"];
}

export function groupPage(overrides: Partial<Schemas["BookingGroupPage"]> = {}) {
  return {
    next: null,
    previous: null,
    results: [group()],
    ...overrides,
  } satisfies Schemas["BookingGroupPage"];
}

/**
 * A refusal shaped the way the transport delivers one.
 *
 * `openapi-fetch` resolves for an HTTP error and puts the body on `error`; only
 * a failure of `fetch` itself rejects. A mock that rejects with a 409 simulates
 * the network dying, not a 409, and every `error.code` branch under test
 * silently stops matching.
 */
export function refusal(code: string, status = 409, details: unknown = null) {
  return {
    data: undefined,
    error: {
      error: { code, message: "Refused.", details, retryable: false, request_id: "req_1" },
    },
    response: new Response(null, { status }),
  };
}
