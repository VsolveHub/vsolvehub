import type { Page, Route } from "@playwright/test";

/**
 * A contract-shaped Django stand-in for the FE-09 browser scenarios.
 *
 * Same boundary as `cart-api.ts`: these prove the frontend's behaviour against
 * the published shapes, not that Django produces them. `django.e2e.ts` is where
 * the real backend is exercised.
 *
 * What this file adds over the cart harness is *sequenced* responses. Half of
 * FE-09 is about time passing without the user doing anything — a group moving
 * from `MATCHING` to `PARTIALLY_HELD`, an offer's undo window closing — and the
 * only way to test that a poll notices is to hand it a different answer on the
 * second read.
 */

const API = "**/api/v1";

export const SERVER_NOW = "2026-08-03T09:00:00Z";

export const money = (paise: number) => ({ amount_paise: paise, currency: "INR" });

export const AUTHENTICATED_PARTNER = {
  user: { id: "partner-1", phone_number: "+919000000002" },
  active_role: "partner",
  roles: ["partner"],
};

export const AUTHENTICATED_CUSTOMER = {
  user: { id: "cust-1", phone_number: "+919000000001" },
  active_role: "customer",
  roles: ["customer"],
};

export const APPROVED_APPLICATION = {
  id: "app-1",
  status: "APPROVED",
  version: 3,
  consents: [],
  documents: [],
  transitions: [],
};

export function unitLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "ul-1",
    position: 0,
    kind: "SERVICE",
    code: "task.fan-installation",
    label: "Fan installation",
    quantity: 1,
    amount: money(24900),
    ...overrides,
  };
}

export function unit(overrides: Record<string, unknown> = {}) {
  return {
    id: "fu-1",
    position: 0,
    status: "MATCHING",
    version: 1,
    starts_at: "2026-08-04T10:00:00Z",
    arrival_window_minutes: 60,
    estimated_duration_minutes: 45,
    state_deadline: null,
    lines: [unitLine()],
    total: money(31742),
    ...overrides,
  };
}

export function group(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    status: "MATCHING",
    version: 1,
    confirmation_policy: "ALL_OR_NOTHING",
    expires_at: "2026-08-03T09:30:00Z",
    server_now: SERVER_NOW,
    recovery_action: "WAIT",
    next_transition_at: "2026-08-03T09:05:00Z",
    units: [unit()],
    created_at: SERVER_NOW,
    updated_at: SERVER_NOW,
    ...overrides,
  };
}

/** A two-visit group, for every all-or-nothing scenario. */
export const TWO_UNIT_GROUP = group({
  units: [
    unit({ id: "fu-1", position: 0, status: "MATCHING" }),
    unit({
      id: "fu-2",
      position: 1,
      status: "MATCHING",
      lines: [unitLine({ id: "ul-2", label: "Geyser repair" })],
    }),
  ],
});

export function offerServiceLine(overrides: Record<string, unknown> = {}) {
  return { line_id: "line-1", service_label: "Fan installation", quantity: 1, scope: {}, ...overrides };
}

export function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: "offer-1",
    checkout_id: null,
    fulfilment_unit_id: "fu-1",
    unit_position: 0,
    starts_at: "2026-08-04T10:00:00Z",
    estimated_duration_minutes: 45,
    approximate_area: "Jubilee Hills",
    service_lines: [offerServiceLine()],
    requirements: ["Ladder"],
    estimated_gross: money(24900),
    commission: money(4980),
    estimated_net: money(19920),
    status: "OFFERED",
    // Far enough out that a countdown is visible for the whole test.
    expires_at: "2026-08-03T10:00:00Z",
    undo_deadline: null,
    created_at: SERVER_NOW,
    ...overrides,
  };
}

export function envelope(code: string, details: unknown = null) {
  return {
    error: { code, message: "Refused.", details, retryable: false, request_id: "req_e2e" },
  };
}

/**
 * CORS headers a credentialed cross-origin request will accept.
 *
 * `Access-Control-Allow-Origin: *` is rejected outright for `credentials:
 * "include"`, which is every call this client makes. The origin must be echoed.
 */
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers().origin ?? "http://localhost:3000";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
    /**
     * Simulates proposal 0010 having landed.
     *
     * `Date` is not a CORS-safelisted response header, so **production Django
     * does not currently expose it** and `serverClock` is never calibrated in a
     * real browser — every countdown silently falls back to the device clock.
     * That defect is filed as
     * `contracts/proposals/0010-server-clock-calibration.md`.
     *
     * Exposing it here is deliberate and is not papering over the bug: it lets
     * these tests prove the *frontend* countdown path is correct end to end, so
     * that when the one-line backend change lands there is nothing left to
     * verify. Remove this line and the countdown assertions fail with the exact
     * symptom production has today — which is how the defect was found.
     */
    "access-control-expose-headers": "Date",
    date: new Date(SERVER_NOW).toUTCString(),
  };
}

async function json(route: Route, body: unknown, status = 200) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(route), body: "" });
    return;
  }
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  });
}

export interface Sequenced {
  status?: number;
  body: unknown;
}

/** Consumes responses in order and repeats the last one forever. */
function sequence(responses: Sequenced[]) {
  let index = 0;
  return () => {
    const response = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return response;
  };
}

export interface DispatchApiOptions {
  session?: unknown;
  application?: unknown;
  /** `GET /booking-groups/`. */
  groupPage?: Sequenced;
  /** `GET /booking-groups/{id}/`, consumed in order so a poll can see change. */
  groupReads?: Sequenced[];
  /** `POST /booking-groups/{id}/cancel/`. */
  cancel?: Sequenced;
  /** `GET /partner/offers/`, consumed in order. */
  offerReads?: Sequenced[];
  /** `POST /partner/offers/{id}/{action}/`, consumed in order. */
  offerCommands?: Sequenced[];
}

export async function installDispatchApi(page: Page, options: DispatchApiOptions = {}) {
  const calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[] =
    [];

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
      headers: request.headers(),
    });
  };

  // Registered first: Playwright gives precedence to the route registered last,
  // so a catch-all added at the end would swallow every handler below it.
  await page.route(`${API}/**`, (route) => {
    record(route);
    return json(route, envelope("not_found"), 404);
  });

  await page.route(`${API}/auth/csrf/`, (route) => json(route, { csrf_token: "e2e-token" }));

  await page.route(`${API}/auth/session/`, (route) => {
    record(route);
    return json(route, options.session ?? AUTHENTICATED_CUSTOMER);
  });

  await page.route(`${API}/partner/application/`, (route) => {
    record(route);
    return json(route, options.application ?? APPROVED_APPLICATION);
  });

  await page.route(`${API}/partner/required-consents/`, (route) => json(route, []));
  await page.route(`${API}/service-areas/`, (route) => json(route, []));
  await page.route(`${API}/partner/skills/`, (route) => json(route, []));

  await page.route(`${API}/booking-groups/`, (route) => {
    record(route);
    const page_ = options.groupPage ?? { body: { next: null, previous: null, results: [group()] } };
    return json(route, page_.body, page_.status ?? 200);
  });

  const nextGroupRead = sequence(options.groupReads ?? [{ body: group() }]);
  await page.route(`${API}/booking-groups/*/`, (route) => {
    record(route);
    const response = nextGroupRead();
    return json(route, response.body, response.status ?? 200);
  });

  await page.route(`${API}/booking-groups/*/cancel/`, (route) => {
    record(route);
    const response = options.cancel ?? { body: group({ status: "CANCELLED", version: 2 }) };
    return json(route, response.body, response.status ?? 200);
  });

  const nextOfferRead = sequence(
    options.offerReads ?? [{ body: { next: null, previous: null, results: [offer()] } }],
  );
  await page.route(`${API}/partner/offers/`, (route) => {
    record(route);
    const response = nextOfferRead();
    return json(route, response.body, response.status ?? 200);
  });

  const nextCommand = sequence(
    options.offerCommands ?? [{ body: offer({ status: "ACCEPTED_PENDING_UNDO" }) }],
  );
  await page.route(`${API}/partner/offers/*/*/`, (route) => {
    record(route);
    const response = nextCommand();
    return json(route, response.body, response.status ?? 200);
  });

  return {
    calls,
    to(path: string) {
      return calls.filter((call) => call.url === path);
    },
    /** Requests whose path starts with `prefix`, for the `{id}` routes. */
    matching(prefix: string) {
      return calls.filter((call) => call.url.startsWith(prefix));
    },
  };
}
