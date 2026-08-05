import type { Schemas } from "@vsolve/api-client";

/**
 * Contract-shaped fixtures for the Operations console.
 *
 * Annotated with the generated types rather than typed loosely, so a field this
 * console invents, renames or drops fails `typecheck` instead of producing a
 * green test against a payload Django never sends. That is the whole point of
 * having a generated client: the fixtures have to be held to it too.
 *
 * The transport helpers below matter as much as the shapes. `openapi-fetch`
 * *resolves* for an HTTP error and puts the envelope on `error`; only a failure
 * of `fetch` itself rejects. A mock that rejects with a 409 is simulating the
 * network dying, not a 409, and every `error.code` branch under test quietly
 * stops matching.
 */

/** A successful response, shaped the way the transport delivers one. */
export function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

/** A refusal, shaped the way the transport delivers one. */
export function refusal(code: string, status = 409, details: unknown = null) {
  return {
    data: undefined,
    error: {
      error: { code, message: "Refused.", details, retryable: false, request_id: "req_1" },
    },
    response: new Response(null, { status }),
  };
}

/**
 * A `409` carrying `details.reason`.
 *
 * The shape `apps/carts/exceptions.py` produces, and the one the compatibility
 * rule surface classifies on. Status alone cannot tell "somebody edited this"
 * from "this was never yours to approve".
 */
export function conflict(reason: string, code = "compatibility_rule_conflict") {
  return refusal(code, 409, { reason });
}

export const OPERATOR_ID = "11111111-1111-4111-8111-111111111111";
export const PROPOSER_ID = "22222222-2222-4222-8222-222222222222";

export function sessionState(
  overrides: Partial<Schemas["SessionState"]> = {},
): Schemas["SessionState"] {
  return {
    user: {
      id: OPERATOR_ID,
      phone_number: "+919000000001",
      full_name: "Ops Reviewer",
      email: "ops@example.test",
      roles: ["operations"],
    },
    active_role: "operations",
    session_expires_at: "2026-08-06T09:00:00Z",
    ...overrides,
  };
}

export function rule(
  overrides: Partial<Schemas["CompatibilityRule"]> = {},
): Schemas["CompatibilityRule"] {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    left_variant_id: "44444444-4444-4444-8444-444444444444",
    left_service_name: "Geyser repair",
    left_variant_name: "Standard",
    right_variant_id: "55555555-5555-4555-8555-555555555555",
    right_service_name: "Deep cleaning",
    right_variant_name: "2 BHK",
    version: 3,
    mode: "SAME_PARTNER_SEQUENTIAL",
    dependency: "LEFT_BEFORE_RIGHT",
    conditions: null,
    effective_from: "2026-09-01T00:00:00Z",
    effective_to: null,
    lifecycle_status: "DRAFT",
    change_reason: "Cleaning after a repair leaves the room usable.",
    created_by_id: PROPOSER_ID,
    reviewed_by_id: null,
    reviewed_at: null,
    review_reason: "",
    created_at: "2026-08-01T09:00:00Z",
    ...overrides,
  };
}

export function money(amountPaise: number): Schemas["Money"] {
  return { amount_paise: amountPaise, currency: "INR" };
}

export function offer(overrides: Partial<Schemas["Offer"]> = {}): Schemas["Offer"] {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    checkout_id: "77777777-7777-4777-8777-777777777777",
    fulfilment_unit_id: null,
    unit_position: null,
    starts_at: "2026-08-06T10:00:00Z",
    estimated_duration_minutes: 60,
    approximate_area: "Gachibowli",
    service_lines: [
      { line_id: "88888888-8888-4888-8888-888888888888", service_label: "Fan installation", quantity: 2, scope: {} },
    ],
    requirements: [],
    estimated_gross: money(120000),
    commission: money(24000),
    estimated_net: money(96000),
    status: "OFFERED",
    expires_at: "2026-08-05T12:30:00Z",
    undo_deadline: null,
    created_at: "2026-08-05T12:00:00Z",
    server_now: "2026-08-05T12:00:00Z",
    ...overrides,
  };
}

export function checkout(overrides: Partial<Schemas["Checkout"]> = {}): Schemas["Checkout"] {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    status: "PAYMENT_PENDING",
    version: 1,
    expires_at: "2026-08-05T13:00:00Z",
    booking_group: null,
    created_at: "2026-08-05T12:00:00Z",
    ...overrides,
  };
}

export const UNIT_ID = "12121212-1212-4212-8212-121212121212";

export function refund(overrides: Partial<Schemas["Refund"]> = {}): Schemas["Refund"] {
  return {
    id: "23232323-2323-4323-8323-232323232323",
    order_id: "20202020-2020-4020-8020-202020202020",
    payment_attempt_id: "24242424-2424-4424-8424-242424242424",
    status: "REQUESTED",
    reason_code: "service-not-delivered",
    reconciliation_state: "PENDING",
    failure_code: "",
    provider_refund_id: "",
    amount: money(150000),
    allocations: [
      {
        id: "25252525-2525-4525-8525-252525252525",
        payment_allocation_id: "26262626-2626-4626-8626-262626262626",
        fulfilment_unit_id: UNIT_ID,
        amount: money(150000),
      },
    ],
    created_at: "2026-08-05T12:00:00Z",
    submitted_at: null,
    completed_at: null,
    ...overrides,
  };
}

export function attempt(
  overrides: Partial<Schemas["DispatchAttempt"]> = {},
): Schemas["DispatchAttempt"] {
  return {
    attempt_id: "13131313-1313-4313-8313-131313131313",
    rank: 1,
    partner_id: "14141414-1414-4414-8414-141414141414",
    created_at: "2026-08-05T11:00:00Z",
    offer_status: "OFFERED",
    eligibility: { skill_match: true },
    ranked: [
      { partner_id: "14141414-1414-4414-8414-141414141414", rank: 1, factors: {} },
      { partner_id: "15151515-1515-4515-8515-151515151515", rank: 2, factors: {} },
    ],
    excluded: [{ partner_id: "16161616-1616-4616-8616-161616161616", reasons: ["out of area"] }],
    ...overrides,
  };
}

export function explanation(
  overrides: Partial<Schemas["DispatchExplanation"]> = {},
): Schemas["DispatchExplanation"] {
  return {
    fulfilment_unit_id: UNIT_ID,
    unit_status: "MATCHING",
    unit_version: 4,
    policy: "partner_uuid_order",
    policy_version: 1,
    attempts: [attempt()],
    server_now: "2026-08-05T12:00:00Z",
    ...overrides,
  };
}

export function unitDispatch(
  overrides: Partial<Schemas["FulfilmentUnitDispatch"]> = {},
): Schemas["FulfilmentUnitDispatch"] {
  return {
    id: UNIT_ID,
    position: 0,
    status: "MATCHING",
    version: 5,
    group_status: "MATCHING",
    live_offer_id: null,
    live_offer_status: null,
    reservation_status: null,
    server_now: "2026-08-05T12:00:05Z",
    ...overrides,
  };
}

export function dispatchReservation(
  overrides: Partial<Schemas["DispatchReservation"]> = {},
): Schemas["DispatchReservation"] {
  return {
    id: "17171717-1717-4717-8717-171717171717",
    fulfilment_unit_id: UNIT_ID,
    partner_id: "14141414-1414-4414-8414-141414141414",
    status: "RELEASED",
    expires_at: "2026-08-05T13:00:00Z",
    released_at: "2026-08-05T12:00:05Z",
    created_at: "2026-08-05T11:00:00Z",
    server_now: "2026-08-05T12:00:05Z",
    ...overrides,
  };
}

export function availabilityRule(
  overrides: Partial<Schemas["PartnerAvailabilityRule"]> = {},
): Schemas["PartnerAvailabilityRule"] {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    service_area_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    weekday: 0,
    starts_at: "09:00",
    ends_at: "17:00",
    ends_next_day: false,
    is_active: true,
    ...overrides,
  };
}

export function availabilityException(
  overrides: Partial<Schemas["PartnerAvailabilityException"]> = {},
): Schemas["PartnerAvailabilityException"] {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    service_area_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    date: "2026-09-10",
    is_available: false,
    starts_at: null,
    ends_at: null,
    ends_next_day: false,
    reason: "Family wedding",
    ...overrides,
  };
}
