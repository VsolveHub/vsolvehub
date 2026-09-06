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
    display_name: "Anitha",
    full_name: "Anitha Rao",
    email: "anitha.rao@example.com",
    date_joined: "2026-01-12T08:30:00Z",
    roles: ["customer"],
    ...overrides,
  };
}

export function authenticatedSession(
  overrides: Partial<Schemas["AuthenticatedSession"]> = {},
): Schemas["AuthenticatedSession"] {
  return {
    user: user(),
    // Django selects a role at login. Defaulting to the one the fixture user
    // holds keeps the fixture internally consistent: a session whose active
    // role is not in `user.roles` is a state the server cannot produce.
    active_role: "customer",
    session_expires_at: iso(60 * 60 * 24 * 14),
    ...overrides,
  };
}

/**
 * The anonymous-safe session projection (contract 1.3.0).
 *
 * Defaults to signed out, because that is what a screen has to handle first and
 * the state most likely to be skipped when the fixture makes the other one free.
 */
export function sessionState(
  overrides: Partial<Schemas["SessionState"]> = {},
): Schemas["SessionState"] {
  return {
    user: null,
    active_role: null,
    session_expires_at: null,
    ...overrides,
  };
}

/** A signed-in projection, for the cases that need one. */
export function signedInSessionState(
  overrides: Partial<Schemas["SessionState"]> = {},
): Schemas["SessionState"] {
  return sessionState({
    user: user(),
    active_role: "customer",
    session_expires_at: iso(60 * 60 * 24 * 14),
    ...overrides,
  });
}

export function csrfToken(
  overrides: Partial<Schemas["CsrfToken"]> = {},
): Schemas["CsrfToken"] {
  return { csrf_token: "test-csrf-token", ...overrides };
}

export function userSession(
  overrides: Partial<Schemas["UserSession"]> = {},
): Schemas["UserSession"] {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    device_label: "Chrome on Android",
    active_role: "customer",
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
    // Published in 1.3.0, so the client no longer defaults it locally.
    code_length: 6,
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
    // Required since contract 1.45.0: subcategories are the browse tiles and
    // carry their own glyph, photo and tile count. Blank image is a real state
    // (the client falls back to the icon), so the fixture defaults to it.
    icon_key: "electrical",
    image_url: "",
    service_count: 1,
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
    // Required since contract 1.45.0; blank is the no-photo fallback state.
    image_url: "",
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
    bookable_variant_id: "8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83",
    // Required since contract 1.27.0. Empty is the A1 card: a priced service you book. An M2
    // service is the mirror image — `starting_price: null`, `bookable_variant_id: null` and an
    // archetype here — so a fixture that omitted this would only ever describe half the catalog.
    request_archetypes: [],
    // Required since contract 1.43.0. The backend owns this vocabulary and the
    // publication constraint rejects a service without one, so a fixture that
    // omitted it described a service the API could never actually return.
    icon_key: "electrical",
    cover: null,
    ...overrides,
  };
}

/**
 * The other half of the catalog: a service you describe rather than price.
 *
 * A3 and A5 services carry no `ServiceRate`, so **both money fields are null and that is the
 * correct state** — the price is whatever a vendor quotes. `request_archetypes` is what tells the
 * card to offer "Tell us what you need" instead of "Check price and availability".
 */
export function requirementServiceCard(
  overrides: Partial<Schemas["ServiceCard"]> = {},
): Schemas["ServiceCard"] {
  return serviceCard({
    id: "66666666-6666-4666-8666-666666666667",
    slug: "construction-helpers",
    name: "Construction helpers",
    short_description: "Tell us how many people you need and for how long.",
    category_slug: "workforce-and-projects",
    subcategory_slug: "construction-labour",
    starting_price: null,
    bookable_variant_id: null,
    request_archetypes: ["A3_TIME_BLOCK"],
    ...overrides,
  });
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

export function fitOutQuestionOption(
  overrides: Partial<Schemas["ServiceQuestionOption"]> = {},
): Schemas["ServiceQuestionOption"] {
  return {
    id: "88888888-8888-4888-8888-888888888881",
    code: "office-fit-out",
    label: "Office fit-out",
    description: "Open desks, meeting rooms, power and data, with a tidy move-in finish.",
    ...overrides,
  };
}

export function fitOutQuestion(
  overrides: Partial<Schemas["ServiceQuestion"]> = {},
): Schemas["ServiceQuestion"] {
  return {
    id: "99999999-9999-4999-8999-999999999998",
    code: "fit_out_style",
    prompt: "What kind of fit-out do you need?",
    help_text: "Pick the closest match. We fill in the rest from the option you choose.",
    kind: "SINGLE_CHOICE",
    is_required: true,
    validation_rules: null,
    options: [
      fitOutQuestionOption(),
      fitOutQuestionOption({
        id: "88888888-8888-4888-8888-888888888882",
        code: "retail-fit-out",
        label: "Retail fit-out",
        description: "Shopfronts, display walls, lighting and customer flow.",
      }),
      fitOutQuestionOption({
        id: "88888888-8888-4888-8888-888888888883",
        code: "hospitality-fit-out",
        label: "Hospitality fit-out",
        description: "Counters, seating zones and durable guest-facing finishes.",
      }),
      fitOutQuestionOption({
        id: "88888888-8888-4888-8888-888888888884",
        code: "shell-core-completion",
        label: "Shell and core completion",
        description: "Partitions, ceilings, flooring and services brought together for a bare shell.",
      }),
    ],
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
    // Required since contract 1.45.0; blank falls back to the service cover.
    image_url: "",
    // A1 is task-priced (contract 1.6.0). The duration-picker fields are gone:
    // the customer buys task units and the server derives the estimate.
    fulfilment_archetype: "A1",
    starting_price: money(19900),
    minimum_service_subtotal: money(19900),
    task_lines: [
      {
        code: "switch-replace",
        label: "Replace one switch",
        unit_price: money(12900),
        marginal_duration_minutes: 20,
      },
    ],
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
    // Empty on an A1 service, and the two lists are never both populated in
    // practice today: `variants` is the priced task list the booking workspace
    // reads, `requirement_variants` is the A3/A5 half the four-screen flow reads.
    // A service carrying both is a catalogue shape nothing has produced yet.
    requirement_variants: [],
    policies: [],
    media: [],
    ...overrides,
  };
}

/**
 * A service you describe rather than price, with the variant the flow needs.
 *
 * `requirement_variants[].questions` is the load-bearing part: screen 1 of the four-screen flow
 * renders exactly those rows, and `submit_requirement` validates the answers against the same
 * authored schema. A fixture without them describes a flow whose first screen has nothing to ask.
 */
export function requirementServiceDetail(
  overrides: Partial<Schemas["ServiceDetail"]> = {},
): Schemas["ServiceDetail"] {
  return serviceDetail({
    ...requirementServiceCard(),
    variants: [],
    requirement_variants: [
      {
        id: "9b1f0c22-6d3e-4b71-9f52-1c0d7e4a9b84",
        code: "standard",
        name: "Construction helpers",
        description: "",
        image_url: "",
        fulfilment_archetype: "A3_TIME_BLOCK",
        required_skill_code: "helper",
        questions: [fitOutQuestion()],
      },
    ],
    ...overrides,
  });
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

/* -------------------------------------------------------------------------
   Booking: windows and quote (contract 1.6.0)
   ------------------------------------------------------------------------- */

/**
 * A window id is opaque and server-signed, so the fixture uses a value no
 * frontend could have composed. A readable `2026-08-03T11:00` here would quietly
 * teach the next person that ids are derivable.
 */
export function bookingWindow(
  overrides: Partial<Schemas["BookingWindow"]> = {},
): Schemas["BookingWindow"] {
  return {
    id: "win_9f2c41ba6d",
    starts_at: iso(60 * 60 * 4),
    ends_at: iso(60 * 60 * 5),
    is_available: true,
    unavailable_reason: null,
    // >1 by default so the common case is not accidentally read as scarce; a
    // scarcity test overrides this explicitly.
    capacity: 2,
    ...overrides,
  };
}

/** The calendar date of `FIXED_NOW` in the booking timezone, so "Today" holds. */
const FIXED_TODAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Kolkata",
}).format(new Date(FIXED_NOW));

export function bookingWindowDay(
  overrides: Partial<Schemas["BookingWindowDay"]> = {},
): Schemas["BookingWindowDay"] {
  return {
    // Derived from `FIXED_NOW` rather than written out: the adapter labels a day
    // "Today" by comparing it with the server clock, so a hardcoded date would
    // silently stop being today and take every window test's anchor with it.
    date: FIXED_TODAY,
    is_today: true,
    // A realistic mix. A day of nothing but bookable windows would let a screen
    // that hides unavailable ones pass, and hiding them is the specific defect
    // the window stage was built to avoid — a gap reads as a broken platform,
    // where "Too soon to book" is something a customer can act on.
    windows: [
      bookingWindow({
        id: "win_toosoon",
        starts_at: iso(60 * 30),
        ends_at: iso(60 * 90),
        is_available: false,
        unavailable_reason: "TOO_SOON",
      }),
      bookingWindow(),
      bookingWindow({
        id: "win_evening",
        starts_at: iso(60 * 60 * 8),
        ends_at: iso(60 * 60 * 9),
      }),
    ],
    ...overrides,
  };
}

export function bookingWindows(
  overrides: Partial<Schemas["BookingWindows"]> = {},
): Schemas["BookingWindows"] {
  return {
    server_now: iso(0),
    estimated_duration_minutes: 60,
    availability_is_preliminary: false,
    timezone: "Asia/Kolkata",
    days: [bookingWindowDay()],
    ...overrides,
  };
}

export function quoteLine(
  overrides: Partial<Schemas["QuoteLine"]> = {},
): Schemas["QuoteLine"] {
  return {
    code: "fan-installation",
    label: "Fan installation × 1",
    amount: money(24900),
    ...overrides,
  };
}

/**
 * The cancellation ladder, in rupees, as the server computed it.
 *
 * Fixed fees rather than percentages, matching the frozen M1 configuration, and
 * pre-computed because deriving a fee client-side would be the frontend
 * computing a price.
 */
export function cancellationPolicy(
  overrides: Partial<Schemas["CancellationPolicy"]> = {},
): Schemas["CancellationPolicy"] {
  return {
    code: "a1-standard",
    version: 3,
    // Free reschedule window, published beside the ladder. Its own boundary, not the ladder's
    // free band: cancelling loses the job, moving it keeps it, so a move stays allowed much
    // closer to the visit than a fee-free cancellation does.
    reschedule_free_notice_hours: 4,
    // The frozen M1 ladder: four fixed fees, not percentages, and visible
    // before search and payment.
    bands: [
      {
        code: "free",
        condition_text: "More than 24 hours before your arrival window",
        fee: money(0),
      },
      {
        code: "standard",
        condition_text: "Between 24 and 2 hours before your arrival window",
        fee: money(4900),
      },
      {
        code: "late",
        condition_text: "Less than 2 hours before your arrival window",
        fee: money(9900),
      },
      {
        code: "arrived",
        condition_text: "After the professional has arrived",
        fee: money(14900),
      },
    ],
    ...overrides,
  };
}

export function quote(overrides: Partial<Schemas["Quote"]> = {}): Schemas["Quote"] {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    version: 1,
    server_now: iso(0),
    expires_at: iso(15 * 60),
    estimated_duration_minutes: 60,
    arrival_window: {
      id: "w_9f2c41ba6d",
      starts_at: iso(60 * 60 * 4),
      ends_at: iso(60 * 60 * 5),
    },
    lines: [
      quoteLine(),
      // Kept at zero rather than omitted: the minimum visit charge is a rule the
      // customer is held to, and a line that only appears when it bites is a
      // rule they discover at the worst moment.
      {
        code: "minimum_visit_topup",
        label: "Minimum visit charge",
        amount: money(0),
      },
    ],
    subtotal: money(24900),
    platform_fee: { code: "platform_fee", label: "Platform fee", amount: money(2900) },
    tax: { code: "gst", label: "GST 18%", amount: money(1582), included_in_total: true },
    total: money(29382),
    cancellation_policy: cancellationPolicy(),
    created_at: iso(0),
    ...overrides,
  };
}

export function cartItem(
  overrides: Partial<Schemas["CartItem"]> = {},
): Schemas["CartItem"] {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    variant_id: "8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83",
    quantity: 1,
    scope_schema_snapshot: {},
    ...overrides,
  };
}
