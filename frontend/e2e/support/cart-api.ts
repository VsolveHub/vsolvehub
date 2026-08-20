import type { Page, Route } from "@playwright/test";

/**
 * A contract-shaped Django stand-in for the `/cart` browser scenarios.
 *
 * ## Why interception rather than a real backend
 *
 * These scenarios are about the *browser*: focus moving into a modal, Escape
 * closing it, a disabled button surviving a double-tap, a conflict producing a
 * recoverable screen. Every one of those needs a real rendering engine, and none
 * of them needs a real database. What they do need is a server that can be put
 * into an exact state — a cart whose version is stale, a merge that must be
 * decided by a human — and seeding those through Django would mean writing
 * backend fixtures this lane does not own.
 *
 * The honest boundary: these prove the frontend's behaviour against the
 * published contract's shapes. They do **not** prove Django produces those
 * shapes. `django.e2e.ts` is where the real backend is exercised, and the two are
 * deliberately kept separate so neither can be mistaken for the other.
 *
 * Every payload below is copied from the schemas in `contracts/openapi/v1.yaml`
 * at version 1.9.0, including the fields 1.9.0 added (`server_now`,
 * `recovery_action`, `next_transition_at`, `state_deadline`). A response that
 * drifts from the contract would make these tests pass against a shape nothing
 * sends.
 */

const API = "**/api/v1";

export const money = (paise: number) => ({ amount_paise: paise, currency: "INR" });

export function cartItem(overrides: Record<string, unknown> = {}) {
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
  };
}

export function cart(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart-1",
    version: 3,
    items: [cartItem()],
    updated_at: "2026-08-02T09:00:00Z",
    ...overrides,
  };
}

export const TWO_ITEM_CART = cart({
  version: 3,
  items: [
    cartItem({ id: "item-1", service_name: "Fan installation" }),
    cartItem({
      id: "item-2",
      variant_id: "variant-2",
      service_slug: "geyser-repair",
      service_name: "Geyser repair",
      variant_name: "Storage geyser",
    }),
  ],
});

export const ADDRESS = {
  id: "addr-1",
  label: "Home",
  line1: "12 Jubilee Hills",
  line2: null,
  landmark: null,
  locality: "Jubilee Hills",
  city: "Hyderabad",
  state: "Telangana",
  postal_code: "500033",
  country_code: "IN",
  latitude: "17.430000",
  longitude: "78.400000",
  source: "MANUAL",
  is_default: true,
  created_at: "2026-08-01T09:00:00Z",
  updated_at: "2026-08-01T09:00:00Z",
};

export const SERVER_NOW = "2026-08-03T09:00:00Z";
/** The one instant these scenarios ask to start at. Published by the server. */
export const PREFERRED_START = "2026-08-04T10:00:00Z";

export const SERVICEABLE = {
  is_serviceable: true,
  postal_code: "500033",
  service_area_id: "area-1",
  service_area_name: "Hyderabad Central",
  checked_at: SERVER_NOW,
};

export const BOOKING_WINDOWS = {
  server_now: SERVER_NOW,
  estimated_duration_minutes: 90,
  availability_is_preliminary: false,
  days: [
    {
      date: "2026-08-04",
      is_today: false,
      windows: [
        {
          id: "win-1",
          starts_at: PREFERRED_START,
          ends_at: "2026-08-04T12:00:00Z",
          is_available: true,
          unavailable_reason: null,
        },
        {
          id: "win-2",
          starts_at: "2026-08-04T14:00:00Z",
          ends_at: "2026-08-04T16:00:00Z",
          is_available: false,
          unavailable_reason: "NO_CAPACITY",
        },
      ],
    },
  ],
};

function planUnitItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "pui-1",
    cart_item_id: "item-1",
    cart_item_version: 1,
    position: 0,
    quantity: 1,
    estimated_duration_minutes: 45,
    variant_snapshot: null,
    scope_snapshot: null,
    configuration_snapshot: null,
    ...overrides,
  };
}

function planUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: "pu-1",
    position: 0,
    starts_at: PREFERRED_START,
    ends_at: "2026-08-04T11:00:00Z",
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
  };
}

/** The recommended alternative: one professional does both services in one visit. */
export const SEQUENTIAL_PLAN = {
  id: "plan-sequential",
  rank: 0,
  structure: "SINGLE_PARTNER_SEQUENTIAL",
  confirmation_policy: "ALL_OR_NOTHING",
  is_recommended: true,
  professional_count: 1,
  visit_count: 1,
  decisive_reasons: ["compatible_same_partner_sequential"],
  units: [
    planUnit({
      id: "pu-seq",
      items: [
        planUnitItem({ id: "pui-a", cart_item_id: "item-1" }),
        planUnitItem({ id: "pui-b", cart_item_id: "item-2", position: 1 }),
      ],
    }),
  ],
  subtotal: money(24900),
  platform_fee: money(2000),
  tax: money(4842),
  total: money(31742),
};

/** Two professionals, one overlapping window. */
export const PARALLEL_PLAN = {
  ...SEQUENTIAL_PLAN,
  id: "plan-parallel",
  rank: 1,
  structure: "COORDINATED_PARALLEL",
  is_recommended: false,
  professional_count: 2,
  visit_count: 1,
  decisive_reasons: ["explicit_parallel_compatibility"],
  units: [
    planUnit({ id: "pu-par-1", position: 0 }),
    planUnit({
      id: "pu-par-2",
      position: 1,
      items: [planUnitItem({ id: "pui-p2", cart_item_id: "item-2" })],
    }),
  ],
  total: money(33900),
};

/** Each service gets its own visit on its own day. */
export const SEPARATE_PLAN = {
  ...SEQUENTIAL_PLAN,
  id: "plan-separate",
  rank: 2,
  structure: "INDEPENDENT_VISITS",
  is_recommended: false,
  professional_count: 2,
  visit_count: 2,
  decisive_reasons: ["independent_visits_safe_default"],
  units: [
    planUnit({ id: "pu-sep-1", position: 0 }),
    planUnit({
      id: "pu-sep-2",
      position: 1,
      starts_at: "2026-08-05T10:00:00Z",
      ends_at: "2026-08-05T11:00:00Z",
      items: [planUnitItem({ id: "pui-s2", cart_item_id: "item-2" })],
    }),
  ],
  total: money(35400),
};

/** Some share a visit, the rest do not. */
export const MIXED_PLAN = {
  ...SEQUENTIAL_PLAN,
  id: "plan-mixed",
  rank: 3,
  structure: "MIXED",
  is_recommended: false,
  professional_count: 2,
  visit_count: 2,
  decisive_reasons: ["compatible_lines_grouped", "visits_separated"],
  units: [
    planUnit({
      id: "pu-mix-1",
      position: 0,
      items: [
        planUnitItem({ id: "pui-m1", cart_item_id: "item-1" }),
        planUnitItem({ id: "pui-m2", cart_item_id: "item-2", position: 1 }),
      ],
    }),
    planUnit({
      id: "pu-mix-2",
      position: 1,
      starts_at: "2026-08-06T10:00:00Z",
      ends_at: "2026-08-06T11:00:00Z",
      items: [planUnitItem({ id: "pui-m3", cart_item_id: "item-2" })],
    }),
  ],
  total: money(34100),
};

export function planSet(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-set-1",
    cart_version: 3,
    status: "ACTIVE",
    server_now: SERVER_NOW,
    expires_at: "2026-08-03T09:15:00Z",
    plans: [SEQUENTIAL_PLAN, PARALLEL_PLAN, SEPARATE_PLAN, MIXED_PLAN],
    created_at: SERVER_NOW,
    ...overrides,
  };
}

export function groupQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-1",
    version: 1,
    status: "ACTIVE",
    cart_version: 3,
    plan_set_id: "plan-set-1",
    plan_id: "plan-sequential",
    structure: "SINGLE_PARTNER_SEQUENTIAL",
    confirmation_policy: "ALL_OR_NOTHING",
    server_now: SERVER_NOW,
    expires_at: "2026-08-03T09:10:00Z",
    units: [
      {
        id: "qu-1",
        position: 0,
        starts_at: PREFERRED_START,
        ends_at: "2026-08-04T11:00:00Z",
        arrival_window_minutes: 60,
        estimated_duration_minutes: 45,
        lines: [
          {
            id: "ql-1",
            position: 0,
            kind: "SERVICE",
            code: "task.fan-installation",
            label: "Fan installation",
            quantity: 1,
            cart_item_id: "item-1",
            amount: money(24900),
          },
          {
            id: "ql-2",
            position: 1,
            kind: "PLATFORM_FEE_ALLOCATION",
            code: "fee.platform",
            label: "Platform fee",
            quantity: 1,
            cart_item_id: null,
            amount: money(2000),
          },
        ],
        total: money(31742),
        cancellation_policy_snapshot: null,
      },
    ],
    total: money(31742),
    created_at: SERVER_NOW,
    ...overrides,
  };
}

export function checkout(overrides: Record<string, unknown> = {}) {
  return {
    id: "checkout-1",
    status: "FINDING_PARTNER",
    version: 1,
    expires_at: "2026-08-03T09:30:00Z",
    booking_group: {
      id: "group-1",
      status: "MATCHING",
      version: 1,
      confirmation_policy: "ALL_OR_NOTHING",
      expires_at: "2026-08-03T09:30:00Z",
      server_now: SERVER_NOW,
      recovery_action: "WAIT",
      next_transition_at: "2026-08-03T09:05:00Z",
      units: [
        {
          id: "fu-1",
          position: 0,
          status: "MATCHING",
          version: 1,
          starts_at: PREFERRED_START,
          arrival_window_minutes: 60,
          estimated_duration_minutes: 45,
          state_deadline: null,
          lines: [
            {
              id: "ful-1",
              position: 0,
              kind: "SERVICE",
              code: "task.fan-installation",
              label: "Fan installation",
              quantity: 1,
              amount: money(24900),
            },
          ],
          total: money(31742),
        },
      ],
      created_at: SERVER_NOW,
      updated_at: SERVER_NOW,
    },
    ...overrides,
  };
}

export const AUTHENTICATED_SESSION = {
  user: {
    id: "cust-1",
    phone_number: "+919000000001",
    display_name: "Anitha",
    full_name: "Anitha Rao",
    email: "anitha@example.test",
    date_joined: "2026-01-12T08:30:00Z",
    roles: ["customer"],
  },
  active_role: "customer",
  session_expires_at: "2026-09-01T09:00:00Z",
};

export const ANONYMOUS_SESSION = {
  user: null,
  active_role: null,
  session_expires_at: null,
};

/** The published error envelope, so the client's own parser is what reads it. */
export function envelope(code: string, details: unknown = null) {
  return {
    error: {
      code,
      message: "Refused.",
      details,
      retryable: false,
      request_id: "req_e2e",
    },
  };
}

export function mergeConflictDetails(
  conflicts: Record<string, unknown>[],
  versions: { customer: number; session: number } = { customer: 2, session: 5 },
) {
  return {
    customer_cart_version: versions.customer,
    session_cart_version: versions.session,
    conflicts,
  };
}

/**
 * CORS headers a *credentialed* cross-origin request will actually accept.
 *
 * This is the detail that makes or breaks an intercepted API. Every client call
 * is `credentials: "include"`, and for those the browser rejects
 * `Access-Control-Allow-Origin: *` outright — the origin must be echoed back
 * exactly, alongside `Access-Control-Allow-Credentials: true`. A wildcard here
 * produces a page that renders its shell and then shows nothing, with the real
 * cause visible only in the console.
 *
 * It also means these tests exercise the same credentialed-CORS path production
 * uses, rather than a relaxed one that would hide a regression in it.
 */
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers().origin ?? "http://localhost:3000";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
    date: new Date("2026-08-03T09:00:00Z").toUTCString(),
  };
}

/** Answers the preflight an unsafe method with custom headers always triggers. */
async function preflight(route: Route): Promise<boolean> {
  if (route.request().method() !== "OPTIONS") return false;
  await route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
  return true;
}

async function json(route: Route, body: unknown, status = 200) {
  if (await preflight(route)) return;
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

export interface CartApiOptions {
  session?: unknown;
  /** `GET /cart/`. An array is served in order, so a refetch can differ. */
  cart?: unknown | unknown[];
  cartStatus?: number;
  addresses?: unknown[];
  /** `PATCH /cart/items/{id}/`. */
  patchItem?: { status?: number; body: unknown };
  /** `POST /cart/items/{id}/remove/`. */
  removeItem?: { status?: number; body: unknown };
  /** `POST /cart/merge/`. */
  merge?: { status?: number; body: unknown };
  /** `POST /fulfilment-plan-sets/` and its `GET` read-back. */
  planSet?: { status?: number; body: unknown };
  /** `GET /fulfilment-plan-sets/{id}/`, when the re-read must differ. */
  planSetRead?: { status?: number; body: unknown };
  /** `POST /plan-quotes/` and its `GET` read-back. */
  quote?: { status?: number; body: unknown };
  quoteRead?: { status?: number; body: unknown };
  /** `POST /checkouts/`. An array is consumed in order across attempts. */
  checkout?: { status?: number; body: unknown } | { status?: number; body: unknown }[];
}

/**
 * Installs the routes and returns a live call log.
 *
 * The log is what lets a scenario assert "the cart was re-read after the
 * conflict" or "the merge was sent once", which are the properties that separate
 * a real recovery from a screen that merely looks recovered.
 */
export async function installCartApi(page: Page, options: CartApiOptions = {}) {
  const calls: {
    method: string;
    url: string;
    body: unknown;
    headers: Record<string, string>;
  }[] = [];

  const record = (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return;
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    calls.push({
      method: request.method(),
      url: new URL(request.url()).pathname,
      body,
      // Lower-cased by Playwright, which matters for `Idempotency-Key`: the
      // stability of that header is the property several scenarios assert.
      headers: request.headers(),
    });
  };

  // Registered first, deliberately: Playwright gives precedence to the route
  // registered **last**, so a catch-all added at the end would swallow every
  // specific handler below it and answer the whole API with 404. Putting it here
  // keeps it as the fallback it is meant to be — a request no scenario expected
  // fails loudly rather than showing up later as an unrelated UI defect.
  await page.route(`${API}/**`, (route) => {
    record(route);
    return json(route, envelope("not_found"), 404);
  });

  // CSRF bootstrap: every unsafe method goes through it before it is sent.
  await page.route(`${API}/auth/csrf/`, (route) => json(route, { csrf_token: "e2e-token" }));

  await page.route(`${API}/auth/session/`, (route) => {
    record(route);
    return json(route, options.session ?? AUTHENTICATED_SESSION);
  });

  await page.route(`${API}/addresses/`, (route) => {
    record(route);
    return json(route, options.addresses ?? []);
  });

  const cartResponses = Array.isArray(options.cart)
    ? [...options.cart]
    : [options.cart ?? TWO_ITEM_CART];
  let cartReads = 0;

  await page.route(`${API}/cart/`, (route) => {
    record(route);
    const index = Math.min(cartReads, cartResponses.length - 1);
    cartReads += 1;
    const status = options.cartStatus ?? 200;
    // A configured failure applies to the first read only; a later read is the
    // recovery, and making it fail too would test a dead end rather than one.
    if (status >= 400 && index === 0) {
      return json(route, cartResponses[0], status);
    }
    return json(route, cartResponses[index], 200);
  });

  // `*` stops at a path separator, so the trailing slash Django's routes carry
  // has to be in the pattern: `items/*` does not match `items/item-1/`.
  await page.route(`${API}/cart/items/*/`, (route) => {
    record(route);
    const patch = options.patchItem;
    if (!patch) return json(route, TWO_ITEM_CART);
    return json(route, patch.body, patch.status ?? 200);
  });

  // Registered after `items/*/`: Playwright prefers the last matching route, and
  // without this the remove POST would fall through to the catch-all 404.
  await page.route(`${API}/cart/items/*/remove/`, (route) => {
    record(route);
    const remove = options.removeItem;
    if (!remove) {
      return json(
        route,
        cart({
          version: 4,
          items: [
            cartItem({
              id: "item-2",
              variant_id: "variant-2",
              service_slug: "geyser-repair",
              service_name: "Geyser repair",
              variant_name: "Storage geyser",
            }),
          ],
        }),
      );
    }
    return json(route, remove.body, remove.status ?? 200);
  });

  await page.route(`${API}/cart/merge/`, (route) => {
    record(route);
    const merge = options.merge;
    if (!merge) return json(route, TWO_ITEM_CART);
    return json(route, merge.body, merge.status ?? 200);
  });

  await page.route(`${API}/serviceability/check/`, (route) => {
    record(route);
    return json(route, SERVICEABLE);
  });

  await page.route(`${API}/booking/windows/`, (route) => {
    record(route);
    return json(route, BOOKING_WINDOWS);
  });

  await page.route(`${API}/fulfilment-plan-sets/`, (route) => {
    record(route);
    const set = options.planSet ?? { body: planSet() };
    return json(route, set.body, set.status ?? 201);
  });

  // The read-back the workspace performs so a withdrawn set stops being usable.
  await page.route(`${API}/fulfilment-plan-sets/*/`, (route) => {
    record(route);
    const read = options.planSetRead ?? options.planSet ?? { body: planSet() };
    return json(route, read.body, read.status ?? 200);
  });

  await page.route(`${API}/plan-quotes/`, (route) => {
    record(route);
    const created = options.quote ?? { body: groupQuote() };
    return json(route, created.body, created.status ?? 201);
  });

  await page.route(`${API}/plan-quotes/*/`, (route) => {
    record(route);
    const read = options.quoteRead ?? options.quote ?? { body: groupQuote() };
    return json(route, read.body, read.status ?? 200);
  });

  const checkoutResponses = Array.isArray(options.checkout)
    ? [...options.checkout]
    : [options.checkout ?? { body: checkout() }];
  let checkoutAttempts = 0;

  await page.route(`${API}/checkouts/`, (route) => {
    record(route);
    const index = Math.min(checkoutAttempts, checkoutResponses.length - 1);
    checkoutAttempts += 1;
    const response = checkoutResponses[index]!;
    return json(route, response.body, response.status ?? 201);
  });

  return {
    calls,
    /** Requests to one path, for "was it re-read?" and "was it sent once?". */
    to(path: string) {
      return calls.filter((call) => call.url === path);
    },
  };
}
