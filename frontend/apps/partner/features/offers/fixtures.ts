import type { Schemas } from "@vsolve/api-client";

/** Contract-shaped offer fixtures, annotated with the generated types. */

export function money(amountPaise: number): Schemas["Money"] {
  return { amount_paise: amountPaise, currency: "INR" };
}

export function serviceLine(overrides: Partial<Schemas["OfferServiceLine"]> = {}) {
  return {
    line_id: "line-1",
    service_label: "Fan installation",
    quantity: 1,
    scope: {},
    ...overrides,
  } satisfies Schemas["OfferServiceLine"];
}

export function offer(overrides: Partial<Schemas["Offer"]> = {}) {
  return {
    id: "offer-1",
    checkout_id: null,
    fulfilment_unit_id: "fu-1",
    unit_position: 0,
    starts_at: "2026-08-04T10:00:00Z",
    estimated_duration_minutes: 45,
    approximate_area: "Jubilee Hills",
    service_lines: [serviceLine()],
    requirements: ["Ladder"],
    estimated_gross: money(24900),
    commission: money(4980),
    estimated_net: money(19920),
    status: "OFFERED",
    expires_at: "2026-08-03T09:05:00Z",
    undo_deadline: null,
    created_at: "2026-08-03T09:00:00Z",
    ...overrides,
  } satisfies Schemas["Offer"];
}

export function offerPage(overrides: Partial<Schemas["OfferPage"]> = {}) {
  return {
    next: null,
    previous: null,
    results: [offer()],
    ...overrides,
  } satisfies Schemas["OfferPage"];
}

/**
 * A refusal shaped the way the transport delivers one.
 *
 * `openapi-fetch` resolves for an HTTP error and puts the body on `error`; only
 * a `fetch` failure rejects. A mock that rejects with a 400 simulates the
 * network dying, and every `error.code` branch under test stops matching.
 */
export function refusal(code: string, status = 400, details: unknown = null) {
  return {
    data: undefined,
    error: {
      error: { code, message: "Refused.", details, retryable: false, request_id: "req_1" },
    },
    response: new Response(null, { status }),
  };
}
