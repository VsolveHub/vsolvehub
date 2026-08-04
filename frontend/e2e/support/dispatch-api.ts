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

/**
 * Session projections, in the shape contract 1.13.0 actually publishes.
 *
 * `roles` belongs to `SessionState.user`, not beside it. These stubs carried it
 * at the top level, which no screen noticed for as long as none of them asked
 * which grants a person holds — an omission that stops being invisible the
 * moment a guard requires a role, because the check reads `user.roles` and finds
 * nothing there.
 */
export const AUTHENTICATED_PARTNER = {
  user: { id: "partner-1", phone_number: "+919000000002", roles: ["partner"] },
  active_role: "partner",
};

export const AUTHENTICATED_CUSTOMER = {
  user: { id: "cust-1", phone_number: "+919000000001", roles: ["customer"] },
  active_role: "customer",
};

/** Nobody signed in — a 200 projection, which is what contract 1.3.0 publishes. */
export const ANONYMOUS_SESSION = {
  user: null,
  active_role: null,
  session_expires_at: null,
};

/**
 * Holds the Partner grant while acting as a Customer.
 *
 * Django selects the alphabetically first grant on login, so this is what every
 * Partner who is also a Customer gets — not an edge case.
 */
export const PARTNER_ACTING_AS_CUSTOMER = {
  user: { id: "partner-1", phone_number: "+919000000002", roles: ["customer", "partner"] },
  active_role: "customer",
};

/**
 * A complete `PartnerApplication`, not the three fields offers happened to need.
 *
 * It was the short version for as long as the only screen reading it checked
 * `status` and nothing else. The home renders the readiness checklist for an
 * unfinished application, which reads `skill_codes` and its siblings — against
 * the short fixture that is a crash, and a crash caused entirely by a shape
 * Django never actually sends.
 */
export const APPROVED_APPLICATION = {
  id: "app-1",
  partner_id: "p-1",
  status: "APPROVED",
  version: 3,
  display_name: "Ravi",
  biography: "",
  experience_years: 3,
  skill_codes: [],
  service_variant_ids: [],
  service_area_ids: [],
  consents: [],
  documents: [],
  transitions: [],
  change_request_message: null,
  submitted_at: null,
  reviewed_at: null,
  review_assigned_at: null,
  review_assigned_to_id: null,
  created_at: "2026-08-01T09:00:00Z",
  updated_at: "2026-08-01T09:00:00Z",
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
    server_now: SERVER_NOW,
    ...overrides,
  };
}

/** Offer list envelope with required `server_now` (contract 1.13.0). */
export function offerPageBody(overrides: Record<string, unknown> = {}) {
  return {
    next: null,
    previous: null,
    results: [offer()],
    server_now: SERVER_NOW,
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
function corsHeaders(route: Route, exposeDateHeader = true): Record<string, string> {
  const origin = route.request().headers().origin ?? "http://localhost:3000";
  const headers: Record<string, string> = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
  };
  if (exposeDateHeader) {
    /**
     * Exposes `Date` the way production Django does after proposal 0010.
     *
     * `Date` is not CORS-safelisted, so the backend must list it in
     * `Access-Control-Expose-Headers`. This harness mirrors that so
     * contract-intercepted browser tests exercise the same calibration path.
     * Real-Django proof lives in `django.e2e.ts` when the backend is reachable.
     */
    headers["access-control-expose-headers"] = "Date";
    headers.date = new Date(SERVER_NOW).toUTCString();
  }
  return headers;
}

async function json(
  route: Route,
  body: unknown,
  status = 200,
  exposeDateHeader = true,
) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders(route, exposeDateHeader), body: "" });
    return;
  }
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(route, exposeDateHeader),
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
  /** `GET /auth/session/`. An array is served in call order, so a login can flip it. */
  session?: unknown;
  application?: unknown;
  /**
   * `GET /partner/application/` with a status of its own.
   *
   * The form to reach for when the answer is a 404: a Partner who has never
   * applied is a state the home has a branch for, not a failure.
   */
  applicationResponse?: Sequenced;
  /** `POST /auth/otp/verify/`, the response that establishes the session. */
  otpVerify?: Sequenced;
  /**
   * Makes login actually change something.
   *
   * With this set, `GET /auth/session/` answers anonymous until
   * `POST /auth/otp/verify/` has been called and answers with this projection
   * afterwards. It is the one behaviour a fixed stub cannot express, and it is
   * the entire subject of a test that signs in and expects to land somewhere.
   */
  signInOnOtpVerify?: unknown;
  /** `POST /auth/roles/switch/`. */
  roleSwitch?: Sequenced;
  /** `GET /booking-groups/`. An array is served in call order for Load more. */
  groupPage?: Sequenced | Sequenced[];
  /** `GET /booking-groups/{id}/`, consumed in order so a poll can see change. */
  groupReads?: Sequenced[];
  /** `POST /booking-groups/{id}/cancel/`. */
  cancel?: Sequenced;
  /** `GET /partner/offers/`, consumed in order. */
  offerReads?: Sequenced[];
  /** `POST /partner/offers/{id}/{action}/`, consumed in order. */
  offerCommands?: Sequenced[];
  /**
   * When false, omit CORS `Date` exposure so only payload `server_now` can
   * calibrate. Defaults to true to mirror production after proposal 0010.
   */
  exposeDateHeader?: boolean;
}

export async function installDispatchApi(page: Page, options: DispatchApiOptions = {}) {
  const calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[] =
    [];
  const exposeDate = options.exposeDateHeader !== false;
  const respond = (route: Route, body: unknown, status = 200) =>
    json(route, body, status, exposeDate);

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
    return respond(route, envelope("not_found"), 404);
  });

  await page.route(`${API}/auth/csrf/`, (route) => respond(route, { csrf_token: "e2e-token" }));

  // Sequenced so a spec can start anonymous and answer as somebody after login.
  // A single value repeats forever, which is what every existing caller passes.
  const nextSession = sequence(
    (Array.isArray(options.session)
      ? options.session
      : [options.session ?? AUTHENTICATED_CUSTOMER]
    ).map((body) => ({ body })),
  );
  // Set once `POST /auth/otp/verify/` has been answered, when the spec asked for
  // a session that login establishes rather than one that was always there.
  let signedInSession: unknown = null;

  await page.route(`${API}/auth/session/`, (route) => {
    record(route);
    if (options.signInOnOtpVerify !== undefined) {
      return respond(route, signedInSession ?? ANONYMOUS_SESSION);
    }
    return respond(route, nextSession().body);
  });

  await page.route(`${API}/auth/otp/request/`, (route) => {
    record(route);
    return respond(route, {
      challenge_id: "chal-1",
      code_length: 6,
      expires_in_seconds: 300,
      resend_after_seconds: 30,
      development_code: null,
    });
  });

  await page.route(`${API}/auth/otp/verify/`, (route) => {
    record(route);
    const established = options.signInOnOtpVerify;
    if (established !== undefined) signedInSession = established;
    const response = options.otpVerify ?? {
      body: { ...(established ?? AUTHENTICATED_PARTNER), session_expires_at: null },
    };
    return respond(route, response.body, response.status ?? 200);
  });

  await page.route(`${API}/auth/roles/switch/`, (route) => {
    record(route);
    const response = options.roleSwitch ?? { body: { role: "partner" } };
    return respond(route, response.body, response.status ?? 200);
  });

  await page.route(`${API}/partner/application/`, (route) => {
    record(route);
    const response = options.applicationResponse ?? {
      body: options.application ?? APPROVED_APPLICATION,
    };
    return respond(route, response.body, response.status ?? 200);
  });

  await page.route(`${API}/partner/required-consents/`, (route) => respond(route, []));
  await page.route(`${API}/service-areas/`, (route) => respond(route, []));
  await page.route(`${API}/partner/skills/`, (route) => respond(route, []));

  const nextGroupList = sequence(
    Array.isArray(options.groupPage)
      ? options.groupPage
      : [options.groupPage ?? { body: { next: null, previous: null, results: [group()] } }],
  );
  await page.route(
    (url) => /\/api\/v1\/booking-groups\/?$/.test(url.pathname),
    (route) => {
      record(route);
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      const configured = options.groupPage;
      if (Array.isArray(configured)) {
        // Cursor-aware: page one is index 0; any cursor loads the next fixture.
        // Call-order sequencing breaks under React Strict Mode double-mount.
        const response = configured[cursor ? Math.min(1, configured.length - 1) : 0]!;
        return respond(route, response.body, response.status ?? 200);
      }
      const response = nextGroupList();
      return respond(route, response.body, response.status ?? 200);
    },
  );

  const nextGroupRead = sequence(options.groupReads ?? [{ body: group() }]);
  await page.route(`${API}/booking-groups/*/`, (route) => {
    record(route);
    const response = nextGroupRead();
    return respond(route, response.body, response.status ?? 200);
  });

  await page.route(`${API}/booking-groups/*/cancel/`, (route) => {
    record(route);
    const response = options.cancel ?? { body: group({ status: "CANCELLED", version: 2 }) };
    return respond(route, response.body, response.status ?? 200);
  });

  const offerReads = options.offerReads ?? [{ body: offerPageBody() }];
  const nextOfferRead = sequence(offerReads);
  const respondOfferList = (route: Route) => {
    record(route);
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    const pageOneBody = offerReads[0]?.body as { next?: string | null } | undefined;
    const multiPage = Boolean(pageOneBody?.next);

    if (multiPage) {
      // Stable page-one for polls + cursor page for Load more. Sequencing would
      // let a poll steal page two before the Partner asks for it.
      const response = offerReads[cursor ? Math.min(1, offerReads.length - 1) : 0]!;
      return respond(route, response.body, response.status ?? 200);
    }

    if (cursor) {
      const response = offerReads[Math.min(1, offerReads.length - 1)]!;
      return respond(route, response.body, response.status ?? 200);
    }

    const response = nextOfferRead();
    return respond(route, response.body, response.status ?? 200);
  };
  // Predicate match: glob `offers/` has been observed to miss `?cursor=` GETs and
  // fall through to the catch-all 404.
  await page.route(
    (url) => /\/api\/v1\/partner\/offers\/?$/.test(url.pathname),
    respondOfferList,
  );

  const nextCommand = sequence(
    options.offerCommands ?? [{ body: offer({ status: "ACCEPTED_PENDING_UNDO" }) }],
  );
  await page.route(`${API}/partner/offers/*/*/`, (route) => {
    record(route);
    const response = nextCommand();
    return respond(route, response.body, response.status ?? 200);
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
