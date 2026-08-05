import type { Page, Route } from "@playwright/test";

/**
 * A contract-shaped Django stand-in for the FE-10 payment scenarios.
 *
 * ## The same boundary as `cart-api.ts` and `dispatch-api.ts`
 *
 * These prove the frontend's behaviour against the shapes contract 1.14.0
 * publishes. They do **not** prove Django produces them. `django.e2e.ts` and the
 * real-Django block at the foot of `payment.e2e.ts` are where the live backend is
 * exercised, and the two are kept apart so neither can be mistaken for the other.
 *
 * ## Why interception is the only way to reach four of these five states
 *
 * A real backend cannot be asked for them. `PAYMENT_REQUIRED` requires every
 * unit's `PartnerOffer` to be `COMMITTED` (`apps/assignments/group_services.py`),
 * which is a multi-actor dispatch chain; and past that, an *expired* reservation,
 * an `AUTHORIZED`-but-uncaptured hold and a `NEEDS_ATTENTION` reconciliation are
 * states you can only obtain by waiting out a real clock or by lying to a real
 * payment provider. The browser behaviour in those states is exactly what has to
 * be proven, because it is where a screen is most likely to claim a payment that
 * did not happen.
 *
 * ## Times are relative to the real clock, deliberately
 *
 * The other harnesses pin `server_now` to a fixed instant. This one cannot: the
 * screen's expiry decisions run through `serverClock`, which calibrates from the
 * `Date` response header, and a fixture frozen in the past would make every live
 * payment look expired the moment the suite outlived its constant. `minutesAway`
 * keeps "live" and "expired" true whenever the suite runs.
 */

const API = "**/api/v1";

/** The provider script the handoff loads on demand. Never fetched for real. */
export const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

export const money = (paise: number) => ({ amount_paise: paise, currency: "INR" });

/** An ISO instant `minutes` from now — negative for the past. */
export function minutesAway(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export const AUTHENTICATED_CUSTOMER = {
  user: { id: "cust-1", phone_number: "+919000000001", roles: ["customer"] },
  active_role: "customer",
  session_expires_at: null,
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
    status: "PAYMENT_PENDING",
    version: 2,
    starts_at: minutesAway(24 * 60),
    arrival_window_minutes: 60,
    estimated_duration_minutes: 45,
    state_deadline: null,
    lines: [unitLine()],
    total: money(31742),
    ...overrides,
  };
}

/**
 * A group that is genuinely waiting to be paid for.
 *
 * Carries the three fields proposal 0011 added — `checkout_id`,
 * `checkout_version`, `order_id`. Without them the payment route has nothing to
 * issue a command against, which is the whole reason 1.14.0 exists, so a fixture
 * that omitted them would be testing a screen that cannot occur.
 */
export function payableGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    status: "PAYMENT_PENDING",
    version: 2,
    confirmation_policy: "ALL_OR_NOTHING",
    expires_at: minutesAway(15),
    server_now: new Date().toISOString(),
    recovery_action: "PAYMENT_REQUIRED",
    next_transition_at: null,
    checkout_id: "checkout-1",
    checkout_version: 4,
    order_id: null,
    units: [unit()],
    created_at: minutesAway(-30),
    updated_at: minutesAway(-1),
    ...overrides,
  };
}

/** The same group once capture has landed and Django has written the Order. */
export function paidGroup(overrides: Record<string, unknown> = {}) {
  return payableGroup({
    status: "BOOKED",
    version: 3,
    recovery_action: "NONE",
    order_id: "order-1",
    units: [unit({ status: "BOOKED", version: 3 })],
    ...overrides,
  });
}

export function allocation(overrides: Record<string, unknown> = {}) {
  return {
    id: "alloc-1",
    fulfilment_unit_id: "fu-1",
    fulfilment_line_id: "ul-1",
    position: 0,
    amount: money(31742),
    refunded: money(0),
    ...overrides,
  };
}

/**
 * A payment attempt in the ordinary live state: created, handed off, unsettled.
 *
 * `provider: "razorpay"` because that is the only provider this client can open a
 * widget for. The local backend runs `PAYMENT_PROVIDER=fake`, which the client
 * deliberately refuses to hand off to — see `model/provider-handoff.ts` — so a
 * `fake` fixture would exercise the "cannot be completed in the browser" branch
 * and never the handoff these scenarios are about.
 */
export function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    checkout_id: "checkout-1",
    booking_group_id: "group-1",
    quote_id: "quote-1",
    purpose: "BOOKING",
    provider: "razorpay",
    provider_public_key: "rzp_test_e2e",
    provider_order_id: "order_rzp_e2e",
    status: "CREATED",
    reconciliation_state: "NONE",
    failure_code: "",
    version: 1,
    amount: money(31742),
    expires_at: minutesAway(15),
    allocations: [allocation()],
    created_at: minutesAway(-1),
    updated_at: minutesAway(-1),
    ...overrides,
  };
}

export function taxDocumentLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "tdl-1",
    position: 0,
    code: "task.fan-installation",
    label: "Fan installation",
    quantity: 1,
    total: money(24900),
    tax: money(4482),
    ...overrides,
  };
}

export function taxDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "tax-1",
    kind: "INVOICE",
    number: "VSH/2026-27/000123",
    legal_entity_code: "vsolve-local",
    financial_year: "2026-27",
    is_test: false,
    issued_at: minutesAway(-1),
    total: money(31742),
    tax_snapshot: {},
    lines: [taxDocumentLine()],
    ...overrides,
  };
}

export function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    checkout_id: "checkout-1",
    booking_group_id: "group-1",
    quote_id: "quote-1",
    status: "CONFIRMED",
    version: 1,
    total: money(31742),
    bookings: [],
    tax_documents: [taxDocument()],
    created_at: minutesAway(-1),
    updated_at: minutesAway(-1),
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
 * "include"`, which is every call this client makes, so the origin is echoed.
 * `Date` is exposed because `serverClock` calibrates from it and every deadline
 * on this screen — the held-for countdown, the expiry — is decided against it.
 */
function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers().origin ?? "http://localhost:3000";
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

export interface PaymentApiOptions {
  session?: unknown;
  /** `GET /booking-groups/{id}/`, consumed in order so a poll can see change. */
  groupReads?: Sequenced[];
  /** `GET /checkouts/{id}/payment/` — the recovery read. 404 means none started. */
  checkoutPayment?: Sequenced[];
  /** `POST /payment-attempts/`. */
  startAttempt?: Sequenced;
  /** `GET /payment-attempts/{id}/`, consumed in order. */
  attemptReads?: Sequenced[];
  /** `POST /payment-attempts/{id}/reconcile/`. */
  reconcile?: Sequenced;
  /** `GET /orders/{id}/`. */
  order?: Sequenced;
  /**
   * Whether to serve a stub provider SDK. On by default.
   *
   * Set false to prove the screen survives a provider script that never loads —
   * the failure the customer sees as "nothing happened when I pressed pay".
   */
  provider?: boolean;
}

/**
 * Installs the routes and returns a live call log.
 *
 * The log is what lets a scenario assert "one command was sent, not two" and
 * "the same Idempotency-Key was used both times", which are the properties that
 * separate a safe money surface from one that merely looks right.
 */
export async function installPaymentApi(page: Page, options: PaymentApiOptions = {}) {
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
      // Lower-cased by Playwright, which matters for `idempotency-key`: its
      // stability across a resumed payment is what several scenarios assert.
      headers: request.headers(),
    });
  };

  /**
   * The provider SDK, stubbed at the network boundary.
   *
   * Registered even when `provider` is false — as an abort rather than a script,
   * so the scenario proving a failed load does not depend on the machine having
   * no internet. Nothing here ever reaches Razorpay.
   */
  if (options.provider === false) {
    await page.route(RAZORPAY_SCRIPT_URL, (route) => route.abort("failed"));
  } else {
    await page.route(RAZORPAY_SCRIPT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        headers: { "access-control-allow-origin": "*" },
        /**
         * A widget that reports and decides nothing.
         *
         * It records what it was opened with, and exposes `__vsolveRazorpay.fire`
         * so a scenario can trigger the SDK's `handler` (what the widget calls a
         * success) or `ondismiss` (the customer closing it). The page's only
         * correct response to either is to re-read the attempt from Django, and
         * these tests exist to prove it does exactly that and nothing more.
         */
        body: `
          window.__vsolveRazorpay = { opens: [], instances: [] };
          window.Razorpay = function (options) {
            var record = { options: options, opened: false };
            window.__vsolveRazorpay.instances.push(record);
            return {
              open: function () {
                record.opened = true;
                window.__vsolveRazorpay.opens.push(options);
              },
            };
          };
          window.__vsolveRazorpay.fire = function (which) {
            var last = window.__vsolveRazorpay.instances[
              window.__vsolveRazorpay.instances.length - 1
            ];
            if (!last) return false;
            if (which === "dismiss") { last.options.modal.ondismiss(); return true; }
            last.options.handler();
            return true;
          };
        `,
      }),
    );
  }

  // Registered first: Playwright gives precedence to the route registered last,
  // so a catch-all added at the end would swallow every handler below it and
  // answer the whole API with 404.
  await page.route(`${API}/**`, (route) => {
    record(route);
    return json(route, envelope("not_found"), 404);
  });

  await page.route(`${API}/auth/csrf/`, (route) => json(route, { csrf_token: "e2e-token" }));

  await page.route(`${API}/auth/session/`, (route) => {
    record(route);
    return json(route, options.session ?? AUTHENTICATED_CUSTOMER);
  });

  /**
   * Server state a scenario can change mid-test, overriding the sequence.
   *
   * Sequenced responses express "the world moves on its own", which is right for
   * a poll picking up a Celery transition. They are the wrong tool for "the
   * webhook lands *now*, because I just told the widget to succeed": that is a
   * consequence of a specific action, and expressing it as "the fourth read"
   * makes the test depend on how many times a 10-second poll happened to fire.
   * These setters let a scenario say when the world changed instead of guessing.
   */
  let groupOverride: Sequenced | null = null;
  let checkoutPaymentOverride: Sequenced | null = null;

  const nextGroup = sequence(options.groupReads ?? [{ body: payableGroup() }]);
  await page.route(`${API}/booking-groups/*/`, (route) => {
    record(route);
    const response = groupOverride ?? nextGroup();
    return json(route, response.body, response.status ?? 200);
  });

  const nextCheckoutPayment = sequence(
    options.checkoutPayment ?? [{ status: 404, body: envelope("not_found") }],
  );
  await page.route(`${API}/checkouts/*/payment/`, (route) => {
    record(route);
    const response = checkoutPaymentOverride ?? nextCheckoutPayment();
    return json(route, response.body, response.status ?? 200);
  });

  // The collection POST. Registered before the detail route below it because a
  // trailing `*` does not cross a path separator, but the ordering is kept
  // explicit so a future glob change cannot silently swap their precedence.
  await page.route(`${API}/payment-attempts/`, (route) => {
    record(route);
    const response = options.startAttempt ?? { status: 202, body: attempt() };
    return json(route, response.body, response.status ?? 202);
  });

  const nextAttempt = sequence(options.attemptReads ?? [{ body: attempt() }]);
  await page.route(`${API}/payment-attempts/*/`, (route) => {
    record(route);
    const response = nextAttempt();
    return json(route, response.body, response.status ?? 200);
  });

  // Last, and therefore highest precedence, over `payment-attempts/*/`.
  await page.route(`${API}/payment-attempts/*/reconcile/`, (route) => {
    record(route);
    const response = options.reconcile ?? { body: attempt({ status: "CAPTURED" }) };
    return json(route, response.body, response.status ?? 200);
  });

  await page.route(`${API}/orders/*/`, (route) => {
    record(route);
    const response = options.order ?? { body: order() };
    return json(route, response.body, response.status ?? 200);
  });

  return {
    calls,
    /** Requests to exactly one path. */
    to(path: string) {
      return calls.filter((call) => call.url === path);
    },
    /** Requests whose path starts with `prefix`, for the `{id}` routes. */
    matching(prefix: string) {
      return calls.filter((call) => call.url.startsWith(prefix));
    },
    /** Every later `GET /checkouts/{id}/payment/` answers with this attempt. */
    setCheckoutPayment(body: unknown, status = 200) {
      checkoutPaymentOverride = { body, status };
    },
    /** Every later `GET /booking-groups/{id}/` answers with this group. */
    setGroup(body: unknown, status = 200) {
      groupOverride = { body, status };
    },
  };
}

/** How many times the stub provider widget was actually opened. */
export async function providerOpenCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const stub = (window as unknown as { __vsolveRazorpay?: { opens: unknown[] } })
      .__vsolveRazorpay;
    return stub ? stub.opens.length : 0;
  });
}

/** Triggers the SDK's success handler or its dismiss callback. */
export async function fireProvider(page: Page, which: "success" | "dismiss"): Promise<boolean> {
  return page.evaluate((event) => {
    const stub = (window as unknown as { __vsolveRazorpay?: { fire: (w: string) => boolean } })
      .__vsolveRazorpay;
    return stub ? stub.fire(event) : false;
  }, which);
}
