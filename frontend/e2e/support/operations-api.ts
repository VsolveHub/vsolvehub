import type { Page, Route } from "@playwright/test";

/**
 * A signed-in Operations session, in a real browser.
 *
 * Every workspace in this console sits behind `OperationsShell`, which renders
 * the sign-in form until Django's session projection says the caller is *acting*
 * as Operations. So none of these routes can be checked for overflow, landmarks
 * or keyboard reachability without a session — and the alternative, leaving them
 * out of the responsive gate, is what let `WorkspaceNav` ship written but never
 * rendered.
 *
 * What is stubbed is the session and the two list reads the queues make. The
 * commands are not: this suite proves the shell paints and the workspaces are
 * reachable by clicking, and a stubbed command would only prove the stub.
 */

const API = "**/api/v1";

export const OPERATIONS_USER = {
  id: "0f7c9f36-6e01-4a2f-9a4a-5b6f0c6e6f11",
  phone_number: "+918019013032",
  full_name: "Ops Reviewer",
  email: "ops@example.test",
  roles: ["customer", "operations"],
} as const;

/**
 * Acting as Operations.
 *
 * Note `roles` carries `customer` too, because Django's `verify_login_otp`
 * re-grants it on every login — a projection without it would be a session shape
 * the server never produces.
 */
export const AUTHENTICATED_OPERATIONS = {
  user: OPERATIONS_USER,
  active_role: "operations",
  session_expires_at: "2026-09-06T09:00:00Z",
} as const;

/** Signed in, holds the grant, but Django has Customer selected — the usual case. */
export const OPERATIONS_ACTING_AS_CUSTOMER = {
  user: OPERATIONS_USER,
  active_role: "customer",
  session_expires_at: "2026-09-06T09:00:00Z",
} as const;

export function envelope(code: string, message = "Refused.") {
  return { error: { code, message, details: null, retryable: false, request_id: "req_1" } };
}

/**
 * CORS headers a credentialed cross-origin request will accept.
 *
 * `Access-Control-Allow-Origin: *` is rejected outright for `credentials:
 * "include"`, which is every call this client makes — the origin has to be
 * echoed. A route stub that gets this wrong does not fail as "unauthenticated";
 * it fails as "we could not check your access", because the fetch never
 * produced a readable response at all.
 *
 * `Date` is exposed the way production Django does, so server-clock calibration
 * runs the same path here as it does live.
 */
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers().origin ?? "http://localhost:3002";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
    "access-control-expose-headers": "Date",
    date: new Date().toUTCString(),
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

const emptyPage = { count: 0, next: null, previous: null, results: [] };

export interface OperationsApiOptions {
  session?: unknown;
}

export async function installOperationsApi(
  page: Page,
  options: OperationsApiOptions = {},
): Promise<void> {
  // Registered first: Playwright gives precedence to the route registered last,
  // so a catch-all added at the end would swallow every handler below it.
  await page.route(`${API}/**`, (route) => json(route, envelope("not_found"), 404));

  await page.route(`${API}/auth/csrf/`, (route) => json(route, { csrf_token: "e2e-token" }));
  await page.route(`${API}/auth/session/`, (route) =>
    json(route, options.session ?? AUTHENTICATED_OPERATIONS),
  );

  // The two queues. Empty is a real answer and the one that exercises each
  // surface's own empty state rather than a fixture's.
  await page.route(`${API}/operations/partner-applications/**`, (route) =>
    json(route, emptyPage),
  );
  await page.route(`${API}/operations/compatibility-rules/**`, (route) => json(route, emptyPage));
}
