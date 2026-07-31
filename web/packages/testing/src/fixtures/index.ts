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

export function serviceQuestionOption(
  overrides: Partial<Schemas["ServiceQuestionOption"]> = {},
): Schemas["ServiceQuestionOption"] {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    code: "one-point",
    label: "One point",
    description: "",
    ...overrides,
  };
}

export function serviceQuestion(
  overrides: Partial<Schemas["ServiceQuestion"]> = {},
): Schemas["ServiceQuestion"] {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    code: "socket-count",
    prompt: "How many switches or sockets need work?",
    help_text: "Count every point that needs repair or replacement.",
    kind: "NUMBER",
    is_required: true,
    validation_rules: null,
    options: [],
    ...overrides,
  };
}

export function serviceVariantConfiguration(
  overrides: Partial<Schemas["ServiceVariantConfiguration"]> = {},
): Schemas["ServiceVariantConfiguration"] {
  return {
    id: "8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83",
    code: "standard",
    name: "Standard",
    description: "A verified electrician diagnoses and repairs the fault.",
    pricing_strategy: "DURATION",
    starting_price: money(19900),
    minimum_duration_minutes: 60,
    recommended_duration_minutes: 90,
    duration_increment_minutes: 30,
    maximum_duration_minutes: 240,
    required_skill_code: "electrical-general",
    questions: [serviceQuestion()],
    ...overrides,
  };
}

/**
 * Full service detail, as the booking-configuration endpoint returns it.
 *
 * Note the empty `policies` and `media`: most catalogue rows carry neither yet,
 * and a fixture that always has them produces a page built around content the
 * real catalogue does not have. Same reasoning as `cover: null` above.
 */
export function serviceDetail(
  overrides: Partial<Schemas["ServiceDetail"]> = {},
): Schemas["ServiceDetail"] {
  const card = serviceCard();
  return {
    ...card,
    description: "",
    variants: [serviceVariantConfiguration()],
    policies: [],
    media: [],
    ...overrides,
  };
}

export function reverseGeocodeResponse(
  overrides: Partial<Schemas["ReverseGeocodeResponse"]> = {},
): Schemas["ReverseGeocodeResponse"] {
  return {
    formatted_address: "Flat 402, Sai Residency, Kukatpally, Hyderabad 500072",
    line1: "Flat 402, Sai Residency",
    locality: "Kukatpally",
    city: "Hyderabad",
    state: "Telangana",
    postal_code: "500072",
    country_code: "IN",
    latitude: "17.494700",
    longitude: "78.399500",
    provider: "test",
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
  options: { details?: unknown; retryable?: boolean; requestId?: string | null } = {},
): Schemas["ApiError"] {
  return {
    error: {
      code,
      message,
      details: options.details ?? null,
      // The server's semantic hint: could retrying this operation ever succeed?
      // Defaults to false so a fixture never implies a retry is safe by accident.
      retryable: options.retryable ?? false,
      request_id: options.requestId ?? "req_01J000000000000000000000",
    },
  };
}
