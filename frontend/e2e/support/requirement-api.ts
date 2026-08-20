import type { Page, Route } from "@playwright/test";

/**
 * A contract-shaped Django stand-in for the M2 Customer request scenarios.
 *
 * ## What this can and cannot reach
 *
 * `page.route` intercepts what the **browser** asks for. `/requests` and
 * `/requests/{id}` are entirely client-fetched, so they are fully covered here.
 *
 * The four-screen flow is **not**, and deliberately so: `/requests/new` and
 * `/requests/new/{service}` read the catalog through `createPublicApi` during a
 * server render, in the Next.js process, where no browser route exists to
 * intercept. Faking it would mean a second stand-in that proves nothing about
 * either half. The flow belongs in `django.e2e.ts` against a real backend, and
 * it is recorded as an outstanding gap rather than quietly skipped.
 *
 * ## The honest boundary
 *
 * These prove the frontend's behaviour against the published contract's shapes.
 * They do **not** prove Django produces those shapes — and for M2 that caveat
 * is sharper than usual: Wave C0 shipped the 17 paths with no tests at all, so
 * nothing has yet confirmed a single one against a real request.
 *
 * Every payload below is copied from `contracts/openapi/v1.yaml` at 1.21.0.
 * **`GET /requirements/` is deliberately served as the cursor envelope the view
 * actually returns**, not as the bare array the document declares — the two
 * disagree, and serving the document's version here would make these pass
 * against a shape nothing sends.
 */

const API = "**/api/v1";

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

export function envelope(code: string, details: unknown = null) {
  return {
    error: { code, message: "Refused.", details, retryable: false, request_id: "req_e2e" },
  };
}

export const IN_TWO_HOURS = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
export const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

export function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    status: "MATCHING",
    category_slug: "housekeeping-staff",
    lifecycle_explanation: "You are hiring people for a period of time.",
    service_by: "2026-08-24",
    quote_delivery_deadline_at: IN_TWO_HOURS,
    teaser_count: 0,
    closure_reason: null,
    last_activity_at: "2026-08-12T09:33:40Z",
    ...overrides,
  };
}

export function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    status: "MATCHING",
    category_slug: "housekeeping-staff",
    inferred_lifecycle: "A3_TIME_BLOCK",
    lifecycle_explanation: "You are hiring people for a period of time.",
    answers: { worker_count: 4 },
    missing_required_answers: [],
    address_id: "addr-1",
    requested_start: "2026-08-20T00:00:00Z",
    flexibility_days: 3,
    is_date_flexible: true,
    service_by: "2026-08-24",
    budget_min_paise: null,
    budget_max_paise: null,
    language: "en-IN",
    additional_details: "",
    attachments: [],
    server_now: new Date().toISOString(),
    ...overrides,
  };
}

export function timeline(events: Record<string, unknown>[] = []) {
  return { events, server_now: new Date().toISOString() };
}

export function timelineEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "e-1",
    at: "2026-08-12T09:31:02Z",
    type: "REQUIREMENT_SUBMITTED",
    detail: {},
    ...overrides,
  };
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers().origin ?? "http://localhost:3000";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
    date: new Date().toUTCString(),
  };
}

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

export interface RequirementApiOptions {
  session?: unknown;
  /** Rows for `GET /requirements/`, served inside the cursor envelope. */
  requirements?: Record<string, unknown>[];
  requirementsStatus?: number;
  detail?: Record<string, unknown>;
  detailStatus?: number;
  timeline?: ReturnType<typeof timeline>;
  timelineStatus?: number;
}

export async function installRequirementApi(page: Page, options: RequirementApiOptions = {}) {
  // Registered first so it stays the fallback: Playwright prefers the route
  // registered last, and a catch-all added at the end would answer the whole
  // API with 404.
  await page.route(`${API}/**`, (route) => json(route, envelope("not_found"), 404));

  await page.route(`${API}/auth/csrf/`, (route) => json(route, { csrf_token: "e2e-token" }));
  await page.route(`${API}/auth/session/`, (route) =>
    json(route, options.session ?? AUTHENTICATED_SESSION),
  );

  await page.route(`${API}/requirements/`, (route) => {
    const status = options.requirementsStatus ?? 200;
    if (status >= 400) return json(route, envelope("service_unavailable"), status);
    // The envelope, not the array. See the header.
    return json(route, {
      next: null,
      previous: null,
      results: options.requirements ?? [summary()],
    });
  });

  // Registered after the collection: `*` stops at a path separator, but the
  // trailing slash Django's routes carry has to be in the pattern.
  await page.route(`${API}/requirements/*/timeline/`, (route) => {
    const status = options.timelineStatus ?? 200;
    if (status >= 400) return json(route, envelope("server_error"), status);
    return json(route, options.timeline ?? timeline([timelineEvent()]));
  });

  await page.route(`${API}/requirements/*/`, (route) => {
    const status = options.detailStatus ?? 200;
    if (status >= 400) return json(route, envelope("m2_requirement_not_found"), status);
    return json(route, options.detail ?? draft());
  });
}
