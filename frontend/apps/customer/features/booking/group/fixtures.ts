import type { Schemas } from "@vsolve/api-client";
import { ApiRequestError } from "@vsolve/api-client";

/**
 * Contract-shaped fixtures for the group booking flow.
 *
 * Every builder is annotated with the **generated** type, so a field the client
 * invents, renames or drops is a compile error rather than a test that passes
 * against a shape Django never sends. That is the whole reason these are not
 * loose object literals: a friendlier fixture would hide exactly the
 * incompatibility it is supposed to catch.
 */

export function money(amountPaise: number): Schemas["Money"] {
  return { amount_paise: amountPaise, currency: "INR" };
}

export function cartItem(overrides: Partial<Schemas["CartItemDetail"]> = {}) {
  return {
    id: "item-1",
    version: 1,
    variant_id: "variant-1",
    service_slug: "fan-installation",
    service_name: "Fan installation",
    variant_name: "Ceiling fan",
    quantity: 1,
    scope: {},
    scope_schema_snapshot: null,
    created_at: "2026-08-02T09:00:00Z",
    updated_at: "2026-08-02T09:00:00Z",
    ...overrides,
  } satisfies Schemas["CartItemDetail"];
}

export function cart(overrides: Partial<Schemas["Cart"]> = {}) {
  return {
    id: "cart-1",
    version: 3,
    items: [cartItem()],
    updated_at: "2026-08-02T09:00:00Z",
    ...overrides,
  } satisfies Schemas["Cart"];
}

export function planUnitItem(overrides: Partial<Schemas["PlanUnitItem"]> = {}) {
  return {
    id: "plan-unit-item-1",
    cart_item_id: "item-1",
    cart_item_version: 1,
    position: 0,
    quantity: 1,
    estimated_duration_minutes: 45,
    variant_snapshot: null,
    scope_snapshot: null,
    configuration_snapshot: null,
    ...overrides,
  } satisfies Schemas["PlanUnitItem"];
}

export function planUnit(overrides: Partial<Schemas["PlanUnit"]> = {}) {
  return {
    id: "plan-unit-1",
    position: 0,
    starts_at: "2026-08-03T10:00:00Z",
    ends_at: "2026-08-03T11:00:00Z",
    arrival_window_minutes: 60,
    estimated_duration_minutes: 45,
    items: [planUnitItem()],
    reason_codes: ["unit_0", "compatible_same_partner_sequential"],
    subtotal: money(24900),
    minimum_visit_adjustment: money(0),
    platform_fee_allocation: money(2000),
    tax: money(4842),
    total: money(31742),
    ...overrides,
  } satisfies Schemas["PlanUnit"];
}

export function plan(overrides: Partial<Schemas["FulfilmentPlan"]> = {}) {
  return {
    id: "plan-1",
    rank: 0,
    structure: "SINGLE_PARTNER_SEQUENTIAL",
    confirmation_policy: "ALL_OR_NOTHING",
    is_recommended: true,
    professional_count: 1,
    visit_count: 1,
    decisive_reasons: ["compatible_same_partner_sequential"],
    units: [planUnit()],
    subtotal: money(24900),
    platform_fee: money(2000),
    tax: money(4842),
    total: money(31742),
    ...overrides,
  } satisfies Schemas["FulfilmentPlan"];
}

export function planSet(overrides: Partial<Schemas["FulfilmentPlanSet"]> = {}) {
  return {
    id: "plan-set-1",
    cart_version: 3,
    status: "ACTIVE",
    server_now: "2026-08-02T09:00:00Z",
    expires_at: "2026-08-02T09:15:00Z",
    plans: [plan()],
    created_at: "2026-08-02T09:00:00Z",
    ...overrides,
  } satisfies Schemas["FulfilmentPlanSet"];
}

export function quoteLine(overrides: Partial<Schemas["GroupQuoteLine"]> = {}) {
  return {
    id: "quote-line-1",
    position: 0,
    kind: "SERVICE",
    code: "task.fan-installation",
    label: "Fan installation",
    quantity: 1,
    cart_item_id: "item-1",
    amount: money(24900),
    ...overrides,
  } satisfies Schemas["GroupQuoteLine"];
}

export function quoteUnit(overrides: Partial<Schemas["GroupQuoteUnit"]> = {}) {
  return {
    id: "quote-unit-1",
    position: 0,
    starts_at: "2026-08-03T10:00:00Z",
    ends_at: "2026-08-03T11:00:00Z",
    arrival_window_minutes: 60,
    estimated_duration_minutes: 45,
    lines: [quoteLine()],
    total: money(31742),
    cancellation_policy_snapshot: null,
    ...overrides,
  } satisfies Schemas["GroupQuoteUnit"];
}

export function groupQuote(overrides: Partial<Schemas["GroupQuote"]> = {}) {
  return {
    id: "quote-1",
    version: 1,
    status: "ACTIVE",
    cart_version: 3,
    plan_set_id: "plan-set-1",
    plan_id: "plan-1",
    structure: "SINGLE_PARTNER_SEQUENTIAL",
    confirmation_policy: "ALL_OR_NOTHING",
    server_now: "2026-08-02T09:00:00Z",
    expires_at: "2026-08-02T09:10:00Z",
    units: [quoteUnit()],
    total: money(31742),
    created_at: "2026-08-02T09:00:00Z",
    ...overrides,
  } satisfies Schemas["GroupQuote"];
}

export function fulfilmentUnitLine(overrides: Partial<Schemas["FulfilmentUnitLine"]> = {}) {
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

export function fulfilmentUnit(overrides: Partial<Schemas["FulfilmentUnit"]> = {}) {
  return {
    id: "fulfilment-unit-1",
    position: 0,
    status: "MATCHING",
    version: 1,
    starts_at: "2026-08-03T10:00:00Z",
    arrival_window_minutes: 60,
    estimated_duration_minutes: 45,
    // 1.9.0's per-unit deadline. Nullable, because a unit that is not waiting on
    // anything has no deadline — which is not the same as one whose deadline is
    // now, and the fixture keeps the distinction available to tests.
    state_deadline: null,
    lines: [fulfilmentUnitLine()],
    total: money(31742),
    ...overrides,
  } satisfies Schemas["FulfilmentUnit"];
}

export function bookingGroup(overrides: Partial<Schemas["BookingGroup"]> = {}) {
  return {
    id: "group-1",
    status: "MATCHING",
    version: 1,
    confirmation_policy: "ALL_OR_NOTHING",
    expires_at: "2026-08-02T09:30:00Z",
    // Added in 1.9.0 with Customer group recovery. `server_now` is what any
    // countdown must be measured against — the browser clock is not a party to
    // this — and `recovery_action` is Django's own instruction, never inferred
    // from `status` here. FE-09 acts on them; FE-08G only has to carry them.
    server_now: "2026-08-02T09:00:00Z",
    recovery_action: "WAIT",
    next_transition_at: "2026-08-02T09:05:00Z",
    units: [fulfilmentUnit()],
    created_at: "2026-08-02T09:00:00Z",
    updated_at: "2026-08-02T09:00:00Z",
    ...overrides,
  } satisfies Schemas["BookingGroup"];
}

export function checkout(overrides: Partial<Schemas["Checkout"]> = {}) {
  return {
    id: "checkout-1",
    status: "FINDING_PARTNER",
    version: 1,
    expires_at: "2026-08-02T09:30:00Z",
    booking_group: bookingGroup(),
    created_at: "2026-08-02T09:00:00Z",
    ...overrides,
  } satisfies Schemas["Checkout"];
}

/** A contract-shaped 409, built through the same envelope parser production uses. */
export function conflict(code: string, details: unknown = null): ApiRequestError {
  return new ApiRequestError(409, {
    code,
    message: "Conflict.",
    details,
    retryable: false,
    request_id: "req_1",
  });
}

/**
 * A refusal shaped the way the transport actually delivers one.
 *
 * This distinction is not pedantry — it decides whether a test proves anything.
 * `openapi-fetch` **resolves** for an HTTP error response and puts the body on
 * `error`; only a failure of `fetch` itself rejects. `request()` relies on
 * exactly that split: a rejection becomes an `ApiNetworkError` with no code,
 * because a request that never reached Django has no Django answer to report.
 *
 * So a mock that *rejects* with a 409 does not simulate a 409. It simulates the
 * network dying, and every `error.code === "cart_version_conflict"` branch under
 * test silently stops matching — the assertions still run, they just no longer
 * exercise the path they name. Use this for anything Django refused, and reject
 * only when the point of the test is that the request never arrived.
 */
export function refusal(
  code: string,
  details: unknown = null,
  status = 409,
): { data: undefined; error: unknown; response: Response } {
  return {
    data: undefined,
    error: {
      error: {
        code,
        message: "Conflict.",
        details,
        retryable: false,
        request_id: "req_1",
      },
    },
    response: new Response(null, { status }),
  };
}
