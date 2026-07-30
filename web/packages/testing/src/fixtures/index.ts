import type { Schemas } from "@vsolve/api-client";

/**
 * Contract-bound test fixtures.
 *
 * Each builder is typed as the generated contract schema, so a contract change
 * that removes or renames a field fails typecheck here rather than producing a
 * mock that silently disagrees with Django. Fixtures are *values*; no request or
 * response type is redeclared.
 *
 * Note: the published contract carries no `examples`, so these values are
 * hand-authored against the schemas. See `contracts/proposals/` — once Codex
 * publishes response examples, these builders should read from them so backend
 * contract tests and frontend mock tests share one source of truth, as required
 * by tasks.md §3.
 *
 * Every builder takes an override so a test can express only what it cares
 * about. Defaults are realistic Hyderabad-market values, never placeholder
 * text that could be mistaken for real data in a screenshot.
 */

/** Deterministic base instant, so snapshot tests do not drift. */
export const FIXED_NOW = "2026-07-30T09:00:00Z";

function iso(offsetSeconds: number, from: string = FIXED_NOW): string {
  return new Date(Date.parse(from) + offsetSeconds * 1000).toISOString();
}

export function money(amountPaise: number): Schemas["Money"] {
  return { amount_paise: amountPaise, currency: "INR" };
}

export function user(overrides: Partial<Schemas["User"]> = {}): Schemas["User"] {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    phone_number: "+919000000001",
    full_name: "Anitha Rao",
    email: "anitha.rao@example.com",
    roles: ["customer"],
    ...overrides,
  };
}

export function authenticatedSession(
  overrides: Partial<Schemas["AuthenticatedSession"]> = {},
): Schemas["AuthenticatedSession"] {
  return {
    user: user(),
    session_expires_at: iso(60 * 60 * 24 * 14),
    ...overrides,
  };
}

export function userSession(
  overrides: Partial<Schemas["UserSession"]> = {},
): Schemas["UserSession"] {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    device_label: "Chrome on Android",
    created_at: iso(-60 * 60 * 24),
    last_seen_at: iso(-60),
    expires_at: iso(60 * 60 * 24 * 13),
    is_current: true,
    ...overrides,
  };
}

export function otpIssued(overrides: Partial<Schemas["OtpIssued"]> = {}): Schemas["OtpIssued"] {
  return {
    challenge_id: "33333333-3333-4333-8333-333333333333",
    expires_in_seconds: 300,
    resend_after_seconds: 30,
    // Null by default because production must never return an OTP code. A test
    // exercising the local-development shortcut sets it explicitly.
    development_code: null,
    ...overrides,
  };
}

export function subcategory(
  overrides: Partial<Schemas["Subcategory"]> = {},
): Schemas["Subcategory"] {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    slug: "electrical",
    name: "Electrical",
    description: "Switches, sockets, wiring and fixtures.",
    ...overrides,
  };
}

export function category(overrides: Partial<Schemas["Category"]> = {}): Schemas["Category"] {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    slug: "technician",
    name: "Technician",
    description: "Electrical, plumbing and appliance work by verified professionals.",
    icon_key: "technician",
    subcategories: [subcategory()],
    ...overrides,
  };
}

export function serviceCard(
  overrides: Partial<Schemas["ServiceCard"]> = {},
): Schemas["ServiceCard"] {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    slug: "switch-socket-repair",
    name: "Switch / Socket Repair",
    short_description: "A verified electrician repairs or replaces faulty switches and sockets.",
    category_slug: "technician",
    subcategory_slug: "electrical",
    starting_price: money(19900),
    recommended_duration_minutes: 60,
    cover: null,
    ...overrides,
  };
}

export function address(overrides: Partial<Schemas["Address"]> = {}): Schemas["Address"] {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    label: "Home",
    line1: "Flat 402, Sai Residency",
    locality: "Kukatpally",
    city: "Hyderabad",
    state: "Telangana",
    postal_code: "500072",
    latitude: "17.494700",
    longitude: "78.399500",
    confirmed_at: iso(-60 * 60),
    created_at: iso(-60 * 60 * 24 * 30),
    updated_at: iso(-60 * 60),
    ...overrides,
  };
}

export function serviceabilityResponse(
  overrides: Partial<Schemas["ServiceabilityResponse"]> = {},
): Schemas["ServiceabilityResponse"] {
  return {
    is_serviceable: true,
    reason_code: null,
    service_area: null,
    server_now: FIXED_NOW,
    ...overrides,
  };
}

/**
 * Builds a contract-shaped error envelope.
 *
 * Tests should use this rather than a bare string body: the client distinguishes
 * a contract-shaped error (ApiRequestError) from an unparseable one
 * (ApiContractError), and that distinction is worth exercising.
 */
export function apiError(
  code: string,
  message: string,
  options: { details?: unknown; requestId?: string | null } = {},
): Schemas["ApiError"] {
  return {
    error: {
      code,
      message,
      details: options.details ?? null,
      request_id: options.requestId ?? "req_01J000000000000000000000",
    },
  };
}
