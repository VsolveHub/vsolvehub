import type { Schemas } from "@vsolve/api-client";

/**
 * Contract-shaped fixtures for the account and address surfaces.
 *
 * Typed against the generated client so a field this app invents, renames or
 * drops is a compile error rather than a green test against a payload Django
 * never sends.
 *
 * `ok` and `refusal` mirror how the transport actually delivers each outcome:
 * `openapi-fetch` **resolves** for an HTTP error and puts the envelope on
 * `error`; only a failure of `fetch` itself rejects. A mock that rejects with a
 * 409 simulates the network dying, not a 409.
 */

export function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

/** A `204` with no body, the way `DELETE /addresses/{id}/` answers. */
export function noContent() {
  return { data: undefined, error: undefined, response: new Response(null, { status: 204 }) };
}

export function refusal(code: string, status = 409, details: unknown = null) {
  return {
    data: undefined,
    error: {
      error: { code, message: "Refused.", details, retryable: false, request_id: "req_1" },
    },
    response: new Response(null, { status }),
  };
}

export function address(overrides: Partial<Schemas["Address"]> = {}): Schemas["Address"] {
  return {
    id: "addr-1",
    label: "Home",
    line1: "Flat 402, Lotus Residency",
    line2: "",
    landmark: "Opposite the bakery",
    locality: "Kondapur",
    city: "Hyderabad",
    state: "Telangana",
    postal_code: "500084",
    country_code: "IN",
    latitude: "17.456789",
    longitude: "78.364512",
    source: "REVERSE_GEOCODED",
    confirmed_at: "2026-07-01T10:00:00Z",
    is_default: true,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

export function preference(
  overrides: Partial<Schemas["CommunicationPreference"]> = {},
): Schemas["CommunicationPreference"] {
  return {
    channel: "SMS",
    purpose: "marketing",
    is_enabled: true,
    updated_at: "2026-07-20T09:00:00Z",
    ...overrides,
  };
}

export function privacyRequest(
  overrides: Partial<Schemas["PrivacyRequest"]> = {},
): Schemas["PrivacyRequest"] {
  return {
    id: "pr-1",
    kind: "ACCESS",
    status: "RECEIVED",
    requested_at: "2026-07-28T09:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

export function resolvedLocation(
  overrides: Partial<Schemas["ReverseGeocodeResponse"]> = {},
): Schemas["ReverseGeocodeResponse"] {
  return {
    line1: "Flat 402, Lotus Residency",
    locality: "Kondapur",
    city: "Hyderabad",
    state: "Telangana",
    postal_code: "500084",
    country_code: "IN",
    formatted_address: "Flat 402, Lotus Residency, Kondapur, Hyderabad 500084",
    latitude: "17.456789",
    longitude: "78.364512",
    provider: "test",
    ...overrides,
  };
}
