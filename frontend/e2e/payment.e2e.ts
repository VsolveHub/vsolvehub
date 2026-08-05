import { expect, test } from "@playwright/test";

import {
  attempt,
  envelope,
  fireProvider,
  installPaymentApi,
  minutesAway,
  order,
  paidGroup,
  payableGroup,
  providerOpenCount,
} from "./support/payment-api";

/**
 * FE-10 Customer payment, in a real browser.
 *
 * ## The property every scenario here is defending
 *
 * **The provider's widget is not a receipt.** Razorpay Checkout calls `handler`
 * on what it believes was a success and `ondismiss` when the customer closes it,
 * and neither is an outcome — the money moves when Razorpay says so to Django
 * over a signed webhook. A screen that renders "paid" from an SDK callback claims
 * a capture the server has not recorded, and it does so most confidently in
 * exactly the cases where the two disagree: a dropped webhook, a late capture, a
 * customer who closed the widget on their bank's 3-D Secure page.
 *
 * Unit tests cover `paymentPhase` thoroughly. What they structurally cannot cover
 * is the part that matters here: a real third-party SDK boundary, a poll that
 * actually fires on a timer and picks up a changed answer, a `sessionStorage` key
 * that really survives a reload, and a button that is pressed twice in the same
 * 200ms by an impatient thumb on a slow connection.
 *
 * ## What is intercepted, and why it has to be
 *
 * Django is intercepted with contract-shaped 1.14.0 payloads — see
 * `support/payment-api.ts` for the boundary. Four of these five states cannot be
 * requested from a real backend at all: reaching `PAYMENT_REQUIRED` needs every
 * unit's `PartnerOffer` to be `COMMITTED` through a multi-actor dispatch chain,
 * and past that, an expired reservation, an authorized-but-uncaptured hold and a
 * `NEEDS_ATTENTION` reconciliation are obtainable only by waiting out a real
 * clock or lying to a real payment provider.
 *
 * The real backend is exercised in the last describe of this file, which proves
 * the server contract those interceptions assume. The two are kept separate so
 * neither can be mistaken for the other.
 */

const GROUP = "/bookings/group-1";
const PAY = `${GROUP}/pay`;

/**
 * The pay button, under either of its names.
 *
 * `Button` swaps its visible label for a spinner while `loading`, leaving only
 * the `sr-only` "Opening payment" in the accessible name. A locator written for
 * the idle name therefore stops resolving the moment the button is pressed —
 * and a second `click({ force: true })` on it does not "press a disabled
 * button", it waits out the entire test timeout looking for an element that no
 * longer exists. `.catch(() => undefined)` cannot rescue that, because the
 * timeout kills the test first.
 *
 * That is what made the double-press scenarios below no-ops. Matching both
 * names is what makes the second press land on the real control.
 */
const PAY_BUTTON = /continue to payment|opening payment/i;
const CHECKOUT_PAYMENT = "/api/v1/checkouts/checkout-1/payment/";
const START_ATTEMPT = "/api/v1/payment-attempts/";

/** The poll runs on a 10s bounded interval, so transitions need room to land. */
const POLL = 30_000;

test.describe("paying for a booking", () => {
  test("takes a customer from an unpaid booking to a receipt", async ({ page }) => {
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      // No attempt exists yet: the ordinary first visit.
      checkoutPayment: [{ status: 404, body: envelope("not_found") }],
      startAttempt: { status: 202, body: attempt() },
    });
    await page.goto(PAY);

    await expect(page.getByRole("heading", { name: "Pay for your booking" })).toBeVisible();
    await expect(page.getByText(/professionals are held, not booked/i)).toBeVisible();

    // Starting the payment is a command, and 202 is not a payment.
    await page.getByRole("button", { name: "Continue to payment" }).click();

    // Every figure on screen is a server field. ₹317.42 is `amount.amount_paise`
    // formatted, not a total this page worked out from the lines beside it.
    await expect(page.getByText("₹317.42").first()).toBeVisible();
    await expect(page.getByText("Visit 1")).toBeVisible();

    const started = api.to(START_ATTEMPT);
    expect(started).toHaveLength(1);
    expect(started[0]?.body).toEqual({
      checkout_id: "checkout-1",
      expected_checkout_version: 4,
    });
    // The version guard travels with the command: paying against a checkout that
    // has moved is a different command against a world the customer never saw.
    expect(started[0]?.headers["idempotency-key"]).toBeTruthy();

    // Hand off to the provider.
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect.poll(() => providerOpenCount(page)).toBe(1);

    // The webhook lands while the widget is still open — which is the only thing
    // that is allowed to turn this screen green.
    api.setCheckoutPayment(attempt({ status: "CAPTURED", version: 2 }));
    api.setGroup(paidGroup());
    expect(await fireProvider(page, "success")).toBe(true);

    await expect(page.getByRole("heading", { name: "Your booking is paid for" })).toBeVisible({
      timeout: POLL,
    });
    await expect(page.getByText(/your payment is confirmed/i)).toBeVisible();

    const receipt = page.getByRole("link", { name: "View your receipt" });
    await expect(receipt).toHaveAttribute("href", `${GROUP}/receipt`);
    await receipt.click();

    await expect(page.getByRole("heading", { name: "Your receipt" })).toBeVisible();
    await expect(page.getByText("Total paid")).toBeVisible();
    await expect(page.getByText("VSH/2026-27/000123")).toBeVisible();
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  });

  test("never claims a payment the server has not confirmed", async ({ page }) => {
    // The single most important test in this file. The widget reports success and
    // the server keeps saying `CREATED` — a dropped or late webhook, which is a
    // routine event and not an exotic one.
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt() }],
    });
    await page.goto(PAY);

    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect.poll(() => providerOpenCount(page)).toBe(1);

    const readsBefore = api.matching(CHECKOUT_PAYMENT).length;
    expect(await fireProvider(page, "success")).toBe(true);

    // The callback's *only* effect is a re-read.
    await expect
      .poll(() => api.matching(CHECKOUT_PAYMENT).length, { timeout: POLL })
      .toBeGreaterThan(readsBefore);

    // And the screen says nothing the server did not say.
    await expect(page.getByText(/your booking is paid for/i)).toHaveCount(0);
    await expect(page.getByText(/your payment is confirmed/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View your receipt" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pay for your booking" })).toBeVisible();
  });

  test("treats a dismissed widget as a question for the server, not a failure", async ({
    page,
  }) => {
    // Closing the widget is not "payment failed" either: the customer may have
    // paid on their bank's page and closed the tab on the way back.
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt() }],
    });
    await page.goto(PAY);

    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect.poll(() => providerOpenCount(page)).toBe(1);

    const readsBefore = api.matching(CHECKOUT_PAYMENT).length;
    expect(await fireProvider(page, "dismiss")).toBe(true);

    await expect
      .poll(() => api.matching(CHECKOUT_PAYMENT).length, { timeout: POLL })
      .toBeGreaterThan(readsBefore);
    await expect(page.getByText(/did not go through/i)).toHaveCount(0);
  });
});

test.describe("coming back to a payment", () => {
  test("recovers the attempt already in flight instead of starting a second one", async ({
    page,
  }) => {
    /**
     * Redirect loss. The customer was taken to their bank, or a UPI app, and came
     * back to a page that knows nothing — a fresh tab, a second device, a
     * notification link. Without the checkout lookup they would either see no
     * payment at all and start a *second* one against the same reservation, or be
     * told to wait for an attempt this client cannot name.
     */
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt({ status: "PROVIDER_PENDING" }) }],
    });
    await page.goto(PAY);

    await expect(page.getByText("₹317.42").first()).toBeVisible();
    await expect(page.getByText(/we are setting up your payment/i)).toBeVisible();

    // The recovery read found it, so no new attempt was raised.
    expect(api.matching(CHECKOUT_PAYMENT).length).toBeGreaterThan(0);
    expect(api.to(START_ATTEMPT)).toHaveLength(0);
  });

  test("keeps one idempotency key across a reload, so a resumed payment replays", async ({
    page,
  }) => {
    // `getStableIdempotencyKey` persists in `sessionStorage`. That is what makes a
    // lost redirect resume the original attempt rather than open a second one
    // against the same held professionals.
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ status: 404, body: envelope("not_found") }],
      startAttempt: { status: 202, body: attempt() },
    });
    await page.goto(PAY);

    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect.poll(() => api.to(START_ATTEMPT).length).toBe(1);
    const firstKey = api.to(START_ATTEMPT)[0]?.headers["idempotency-key"];
    expect(firstKey).toBeTruthy();

    // The tab is reloaded before the provider ever reported — the redirect-loss
    // shape. The server still has no attempt, so the customer presses pay again.
    await page.reload();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect.poll(() => api.to(START_ATTEMPT).length).toBe(2);

    // Same checkout, same version, therefore the same command — and Django must
    // replay the original attempt rather than create a rival one.
    expect(api.to(START_ATTEMPT)[1]?.headers["idempotency-key"]).toBe(firstKey);
  });

  test("says plainly when a booking is not waiting for payment at all", async ({ page }) => {
    await installPaymentApi(page, {
      groupReads: [{ body: payableGroup({ recovery_action: "WAIT", order_id: null }) }],
    });
    await page.goto(PAY);

    await expect(page.getByText(/not waiting for payment/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /continue to payment/i })).toHaveCount(0);
  });
});

test.describe("pressing pay twice", () => {
  test("raises one payment attempt, not two", async ({ page }) => {
    /**
     * Duplicate submission on the money path. A slow connection and an impatient
     * second tap is the ordinary way a customer ends up with two payments against
     * one reservation, and the button's own pending state is the first line of
     * defence — the idempotency key is the second.
     */
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ status: 404, body: envelope("not_found") }],
      startAttempt: { status: 202, body: attempt() },
    });
    await page.goto(PAY);

    await page.getByRole("button", { name: "Continue to payment" }).click();
    // `force`, because the point is what happens when the control is already
    // disabled: a test that politely waited for it to be clickable would prove
    // nothing about the double-tap it is named after. The locator has to match
    // the busy name too — see `PAY_BUTTON`.
    const pay = page.getByRole("button", { name: PAY_BUTTON });
    await pay.click({ force: true }).catch(() => undefined);

    await expect(page.getByText("₹317.42").first()).toBeVisible();
    expect(api.to(START_ATTEMPT)).toHaveLength(1);
  });

  test("opens one provider widget, never two over the top of each other", async ({ page }) => {
    // Two provider sessions against one order is how a customer ends up looking
    // at two dialogs and trusting whichever closes last.
    await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt() }],
    });
    await page.goto(PAY);

    await page.getByRole("button", { name: "Continue to payment" }).click();
    // The widget is open and the control is now busy and disabled. Both further
    // presses are real presses on the real button — see `PAY_BUTTON` for why
    // they used to be sixty-second waits on a locator that resolved to nothing.
    const pay = page.getByRole("button", { name: PAY_BUTTON });
    await expect(pay).toBeDisabled();
    await pay.click({ force: true }).catch(() => undefined);
    await pay.click({ force: true }).catch(() => undefined);

    await expect.poll(() => providerOpenCount(page)).toBe(1);
    // Still one after the widget has had time to settle.
    await page.waitForTimeout(1_000);
    expect(await providerOpenCount(page)).toBe(1);
  });

  test("sends one reconciliation however many times the customer asks", async ({ page }) => {
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt({ status: "AUTHORIZED" }) }],
      reconcile: { body: attempt({ status: "AUTHORIZED" }) },
    });
    await page.goto(PAY);

    const check = page.getByRole("button", { name: "Check again" });
    await expect(check).toBeVisible();
    await check.click();
    await check.click({ force: true }).catch(() => undefined);

    await expect
      .poll(() => api.matching("/api/v1/payment-attempts/attempt-1/reconcile/").length)
      .toBe(1);
  });
});

test.describe("a payment window that has closed", () => {
  test("says nothing was charged and offers no way to pay", async ({ page }) => {
    /**
     * Expired reservation. The held professionals have been released, so the one
     * thing this screen must not do is take money for them — and the one thing it
     * must say is that nothing was taken already.
     */
    await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt({ expires_at: minutesAway(-1) }) }],
    });
    await page.goto(PAY);

    await expect(page.getByText(/this payment window has closed/i)).toBeVisible();
    await expect(page.getByText(/you have not been charged/i)).toBeVisible();
    await expect(page.getByText(/have been released/i)).toBeVisible();

    // No handoff, on either label the button can carry.
    await expect(page.getByRole("button", { name: /continue to payment/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /try payment again/i })).toHaveCount(0);
    expect(await providerOpenCount(page)).toBe(0);
  });

  test("shows a capture that landed just before the window closed as paid", async ({ page }) => {
    // Ordering that matters: an attempt can capture moments before its own expiry.
    // The customer whose money moved must never be shown an expiry notice.
    await installPaymentApi(page, {
      groupReads: [{ body: paidGroup() }],
      checkoutPayment: [{ body: attempt({ status: "CAPTURED", expires_at: minutesAway(-1) }) }],
    });
    await page.goto(PAY);

    await expect(page.getByRole("heading", { name: "Your booking is paid for" })).toBeVisible();
    await expect(page.getByText(/this payment window has closed/i)).toHaveCount(0);
  });

  test("counts down against the server's clock while the window is open", async ({ page }) => {
    await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt({ expires_at: minutesAway(15) }) }],
    });
    await page.goto(PAY);

    // Digits for sight, a coarse phrase for assistive technology: a per-second
    // string in a live region is unusable read aloud.
    await expect(page.getByText(/held for/i)).toBeVisible();
    await expect(page.getByText(/payment window closed/i)).toHaveCount(0);
  });
});

test.describe("an outcome nobody can confirm yet", () => {
  test("tells an authorized-but-uncaptured customer not to pay again", async ({ page }) => {
    /**
     * Ambiguity. `AUTHORIZED` is settled — the provider is done — while being
     * emphatically unresolved: an authorization that never captures is money the
     * customer can watch leave their account against a booking that never
     * happened. The worst possible screen here is one that offers to pay again.
     */
    await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt({ status: "AUTHORIZED" }) }],
    });
    await page.goto(PAY);

    await expect(page.getByText(/we are confirming this payment/i)).toBeVisible();
    await expect(page.getByText(/do not pay again/i)).toBeVisible();
    await expect(page.getByText(/it is accounted for/i)).toBeVisible();

    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue to payment/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /try payment again/i })).toHaveCount(0);
  });

  test("keeps watching an attempt Django is actively reconciling", async ({ page }) => {
    // `NEEDS_ATTENTION` reopens a settled attempt: Django is saying its record and
    // the provider's disagree. A poll that stopped here would freeze the customer
    // on a stale answer for as long as the disagreement lasted.
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [
        { body: attempt({ status: "CAPTURED", reconciliation_state: "NEEDS_ATTENTION" }) },
      ],
    });
    await page.goto(PAY);

    await expect(page.getByText(/we are confirming this payment/i)).toBeVisible();

    const readsBefore = api.matching(CHECKOUT_PAYMENT).length;
    await expect
      .poll(() => api.matching(CHECKOUT_PAYMENT).length, { timeout: POLL })
      .toBeGreaterThan(readsBefore);
  });

  test("resolves to paid once reconciliation settles it", async ({ page }) => {
    const api = await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt({ status: "AUTHORIZED" }) }],
      reconcile: { body: attempt({ status: "CAPTURED", version: 2 }) },
    });
    await page.goto(PAY);

    // Wait for the ambiguous screen before moving the world. Overriding first
    // meant the very first read already answered `CAPTURED`, so `Check again`
    // never existed and the click waited out the test — the scenario never
    // exercised reconciliation at all.
    const check = page.getByRole("button", { name: "Check again" });
    await expect(check).toBeVisible();

    api.setCheckoutPayment(attempt({ status: "CAPTURED", version: 2 }));
    api.setGroup(paidGroup());
    await check.click();

    await expect(page.getByRole("heading", { name: "Your booking is paid for" })).toBeVisible({
      timeout: POLL,
    });
  });

  test("an unreachable provider changes nothing, and says so", async ({ page }) => {
    // 503 on reconcile is its own outcome, not a retry signal. Hammering an
    // unreachable provider from the browser makes the ambiguity last longer.
    await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt({ status: "AUTHORIZED" }) }],
      reconcile: { status: 503, body: envelope("payment_provider_unavailable") },
    });
    await page.goto(PAY);

    await page.getByRole("button", { name: "Check again" }).click();

    await expect(page.getByRole("alert").first()).toContainText(/nothing has changed/i);
    // Still ambiguous, still no invitation to pay a second time.
    await expect(page.getByText(/do not pay again/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /continue to payment/i })).toHaveCount(0);
  });

  test("explains a provider script that will not load, without stranding the customer", async ({
    page,
  }) => {
    await installPaymentApi(page, {
      groupReads: [{ body: payableGroup() }],
      checkoutPayment: [{ body: attempt() }],
      provider: false,
    });
    await page.goto(PAY);

    await page.getByRole("button", { name: "Continue to payment" }).click();

    await expect(page.getByRole("alert").first()).toContainText(/could not be reached/i);
    // Nothing was claimed in either direction, and the customer can try again.
    await expect(page.getByText(/your booking is paid for/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
  });
});

test.describe("the receipt", () => {
  test("refuses to invent one for a booking that has not been paid for", async ({ page }) => {
    await installPaymentApi(page, {
      groupReads: [{ body: payableGroup({ order_id: null }) }],
    });
    await page.goto(`${GROUP}/receipt`);

    await expect(page.getByText(/there is no receipt yet/i)).toBeVisible();
    await expect(page.getByText(/you have not been charged/i)).toBeVisible();
  });

  test("shows the invoice Django wrote, line by line", async ({ page }) => {
    await installPaymentApi(page, {
      groupReads: [{ body: paidGroup() }],
      order: { body: order() },
    });
    await page.goto(`${GROUP}/receipt`);

    await expect(page.getByRole("heading", { name: "Your receipt" })).toBeVisible();
    await expect(page.getByText("Total paid")).toBeVisible();
    await expect(page.getByText("Invoice")).toBeVisible();
    await expect(page.getByText("Document total")).toBeVisible();
    // The document total and the line total are separate server fields; nothing
    // on this page derives one from the other.
    await expect(page.getByText("₹317.42").first()).toBeVisible();
    await expect(page.getByText("₹249").first()).toBeVisible();
  });

  test("marks a test-mode document as one, so it cannot pass for a real invoice", async ({
    page,
  }) => {
    await installPaymentApi(page, {
      groupReads: [{ body: paidGroup() }],
      order: { body: order({ tax_documents: [{ ...order().tax_documents[0], is_test: true }] }) },
    });
    await page.goto(`${GROUP}/receipt`);

    await expect(page.getByText("Test document")).toBeVisible();
  });
});

/**
 * The real backend, exercised the way `django.e2e.ts` does it.
 *
 * ## What this can and cannot prove
 *
 * It cannot reach a paid booking. `PAYMENT_REQUIRED` requires every unit's
 * `PartnerOffer` to be `COMMITTED` (`apps/assignments/group_services.py`), which
 * means a seeded catalogue, a matching partner, a dispatch cycle, an accepted
 * offer and an elapsed undo window — a multi-actor chain with no seeding command
 * behind it. Claiming otherwise by driving it through fixtures would produce a
 * green test that proves the fixtures.
 *
 * What it does prove is the half of the contract the intercepted scenarios above
 * take on trust: that these payment routes exist on the real server, that they
 * refuse anonymous callers, that they refuse to hand one customer another's
 * payment, and that a missing attempt is the `404` the client reads as "nothing
 * started" rather than an error it would render as a failure. Every one of those
 * is a claim `support/payment-api.ts` bakes into its stubs.
 *
 * ## Local prerequisites
 *
 *   backend running on API_ORIGIN, CORS_ALLOWED_ORIGINS including the Customer
 *   origin, PAYMENT_PROVIDER=fake
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

/** A well-formed uuid that no record will ever have. */
const ABSENT_UUID = "00000000-0000-4000-8000-000000000000";

async function djangoIsReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/health/live/`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

test.describe("the payment surface against real Django", () => {
  test.beforeEach(async () => {
    test.skip(!(await djangoIsReachable()), `Django is not reachable at ${API_ORIGIN}`);
  });

  test("refuses every payment route to an anonymous caller", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const statuses = await page.evaluate(
      async ({ origin, absent }) => {
        const read = async (path: string) => {
          const response = await fetch(`${origin}${path}`, { credentials: "include" });
          return response.status;
        };
        return {
          attempt: await read(`/api/v1/payment-attempts/${absent}/`),
          checkoutPayment: await read(`/api/v1/checkouts/${absent}/payment/`),
          order: await read(`/api/v1/orders/${absent}/`),
          taxDocument: await read(`/api/v1/tax-documents/${absent}/`),
        };
      },
      { origin: API_ORIGIN, absent: ABSENT_UUID },
    );

    // 403, not 401: DRF's SessionAuthentication sends no `WWW-Authenticate`, so an
    // unauthenticated request is refused with 403 carrying `not_authenticated`.
    // What matters is that none of them answered with somebody's money.
    expect(statuses.attempt).toBe(403);
    expect(statuses.checkoutPayment).toBe(403);
    expect(statuses.order).toBe(403);
    expect(statuses.taxDocument).toBe(403);
  });

  test("will not start a payment without an idempotency key", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const status = await page.evaluate(
      async ({ origin, absent }) => {
        const csrf = await (
          await fetch(`${origin}/api/v1/auth/csrf/`, { credentials: "include" })
        ).json();
        const response = await fetch(`${origin}/api/v1/payment-attempts/`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", "X-CSRFToken": csrf.csrf_token },
          body: JSON.stringify({ checkout_id: absent, expected_checkout_version: 1 }),
        });
        return response.status;
      },
      { origin: API_ORIGIN, absent: ABSENT_UUID },
    );

    // Refused either way — never a 202 that created an unkeyed money command.
    expect(status).not.toBe(202);
    expect([400, 403, 409, 422]).toContain(status);
  });

  test("exposes Date over credentialed CORS, so payment deadlines are the server's", async ({
    page,
  }) => {
    // Every expiry decision on the payment screen runs through `serverClock`.
    // Without a readable `Date` it falls back to the device clock, and a phone
    // whose clock is days out would hide a live payment behind an expiry notice.
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const probe = await page.evaluate(async (origin) => {
      try {
        const response = await fetch(`${origin}/api/v1/auth/csrf/`, { credentials: "include" });
        return { ok: response.ok, dateReadable: response.headers.get("date") !== null, error: null };
      } catch (error) {
        return { ok: false, dateReadable: false, error: String(error) };
      }
    }, API_ORIGIN);

    // Reaching a body at all is the credentialed-CORS proof: a browser will not
    // hand script the response of a `credentials: "include"` request unless the
    // server allowed it, and rejects it at the network layer instead.
    expect(probe.error).toBeNull();
    expect(probe.ok).toBe(true);
    expect(
      probe.dateReadable,
      `Django at ${API_ORIGIN} did not expose a readable Date header. serverClock ` +
        "cannot calibrate without it, so every payment deadline falls back to the " +
        "device clock. Set CORS_EXPOSE_HEADERS to include Date (proposal 0010).",
    ).toBe(true);
  });

  test("publishes the payment routes this client calls", async ({ page }) => {
    // A 404 here would mean the client is calling a path that does not exist —
    // the one failure the intercepted scenarios above could never surface,
    // because interception answers whatever path it is asked for.
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const schema = await page.evaluate(async (origin) => {
      const response = await fetch(`${origin}/api/v1/schema/?format=json`, {
        credentials: "include",
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { paths?: Record<string, unknown> };
      return Object.keys(body.paths ?? {});
    }, API_ORIGIN);

    test.skip(schema === null, "API_DOCS_ENABLED is off, so the schema cannot be read");

    for (const path of [
      "/api/v1/payment-attempts/",
      "/api/v1/payment-attempts/{attempt_id}/",
      "/api/v1/payment-attempts/{attempt_id}/reconcile/",
      "/api/v1/checkouts/{checkout_id}/payment/",
      "/api/v1/orders/{order_id}/",
    ]) {
      expect(schema, `${path} is missing from the published schema`).toContain(path);
    }
  });
});
