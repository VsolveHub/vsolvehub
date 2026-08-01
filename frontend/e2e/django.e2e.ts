import { expect, test, type Page } from "@playwright/test";

/**
 * Real-browser acceptance against Django, not MSW.
 *
 * This is the proof proposal 0006 asked for and the one thing unit and MSW tests
 * structurally cannot give: credentialed CORS, an HttpOnly cookie the frontend
 * origin can never read, a CSRF token that only exists in memory, and a session
 * that a revoke actually ends. Every one of those can be green in `vitest` while
 * the first authenticated mutation in a browser fails.
 *
 * ## Why it skips instead of failing when Django is down
 *
 * The rest of the suite proves frontend behaviour and must stay runnable without
 * a backend. This spec cannot. A skip is honest — the report says it did not
 * run — where a failure would train people to ignore a red suite. It does *not*
 * pass silently: `test.skip` marks it skipped in the reporter.
 *
 * ## Local prerequisites
 *
 *   backend running on API_ORIGIN with OTP_DEVELOPMENT_CODE_ENABLED=true
 *   CORS_ALLOWED_ORIGINS including the Partner origin
 *
 * The development OTP adapter returns `development_code` so the browser can
 * complete a login without an SMS. That flag is refused in production settings.
 */

const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** A number nobody else is using, so repeated local runs cannot collide. */
function uniquePhoneNumber(): string {
  const tail = String(Date.now() % 100_000_000).padStart(8, "0");
  return `+9199${tail}`;
}

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

/** Reads everything the page has put in web storage, for the leak assertions. */
async function browserStorage(page: Page): Promise<string> {
  return page.evaluate(() =>
    [
      ...Object.entries(window.localStorage).flat(),
      ...Object.entries(window.sessionStorage).flat(),
    ].join(" "),
  );
}

test.describe("credentialed browser session against Django", () => {
  test.beforeEach(async () => {
    test.skip(!(await djangoIsReachable()), `Django is not reachable at ${API_ORIGIN}`);
  });

  test("bootstraps CSRF over a credentialed cross-origin request", async ({ page }) => {
    await page.goto("/apply", { waitUntil: "domcontentloaded" });

    const bootstrap = await page.evaluate(async (origin) => {
      try {
        const response = await fetch(`${origin}/api/v1/auth/csrf/`, {
          credentials: "include",
        });
        const body = (await response.json()) as { csrf_token?: string };
        return { ok: response.ok, token: body.csrf_token ?? null, error: null };
      } catch (error) {
        return { ok: false, token: null, error: String(error) };
      }
    }, API_ORIGIN);

    // Reaching a body at all *is* the credentialed-CORS proof. A browser will
    // not hand JavaScript the response of a `credentials: "include"` request
    // unless the server sent `Access-Control-Allow-Credentials: true` — it
    // rejects it at the network layer instead, which is what `error` captures.
    // The header itself is deliberately unreadable from script, so asserting on
    // it would only ever test the CORS spec.
    expect(bootstrap.error).toBeNull();
    expect(bootstrap.ok).toBe(true);
    expect(bootstrap.token).toBeTruthy();
  });

  test("keeps the session cookie unreadable from the frontend origin", async ({ page }) => {
    await page.goto("/apply", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (origin) => fetch(`${origin}/api/v1/auth/csrf/`, { credentials: "include" }),
      API_ORIGIN,
    );

    // The cookie is HttpOnly and set on the API origin: a sibling frontend
    // origin cannot see it. This is why the token had to move into the body.
    const readable = await page.evaluate(() => document.cookie);
    expect(readable).not.toContain("csrftoken");
    expect(readable).not.toContain("sessionid");
  });

  test("completes OTP login and an authenticated mutation, then revoke ends it", async ({
    page,
  }) => {
    const phoneNumber = uniquePhoneNumber();

    await page.goto("/apply", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel(/mobile number/i)).toBeVisible();

    // Driven entirely through the shipped UI. An earlier version requested a
    // code over `fetch` first to learn the development code, then asked the form
    // for a second one — which Django correctly refused under its per-number
    // resend cooldown. Reading the code off the screen exercises the real
    // transport, including the client's own CSRF bootstrap and header injection.
    await page.getByLabel(/mobile number/i).fill(phoneNumber.replace("+91", ""));
    await page.getByRole("button", { name: /send code/i }).click();

    const codeField = page.getByLabel(/digit code/i);
    await expect(codeField).toBeVisible({ timeout: 20_000 });

    // The development adapter prints the code into the form; production returns
    // null here and this branch never runs.
    const developmentPanel = page.getByText(/development delivery is on/i);
    const hasDevelopmentCode = await developmentPanel.isVisible().catch(() => false);
    test.skip(
      !hasDevelopmentCode,
      "Django is not running with OTP_DEVELOPMENT_CODE_ENABLED, so a browser cannot complete login",
    );

    const developmentCode = ((await developmentPanel.textContent()) ?? "").replace(/\D/g, "");
    expect(developmentCode).not.toHaveLength(0);

    await codeField.fill(developmentCode);
    await page.getByRole("button", { name: /verify and continue/i }).click();

    // Past the login gate means Django issued a session and the browser is
    // sending it back on a cross-origin request.
    await expect(page.getByRole("link", { name: /your application/i })).toBeVisible({
      timeout: 20_000,
    });

    // Nothing sensitive may be in web storage, however convenient it would be.
    const stored = await browserStorage(page);
    expect(stored).not.toContain("csrf");
    expect(stored).not.toContain("sessionid");
    if (developmentCode) expect(stored).not.toContain(developmentCode);

    // An authenticated mutation through the shipped client.
    const mutation = await page.evaluate(async (origin) => {
      const csrf = await (
        await fetch(`${origin}/api/v1/auth/csrf/`, { credentials: "include" })
      ).json();
      const response = await fetch(`${origin}/api/v1/partner/application/`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "X-CSRFToken": csrf.csrf_token },
        body: JSON.stringify({ display_name: "Browser Acceptance" }),
      });
      return response.status;
    }, API_ORIGIN);

    // 200 for an existing application, 201 when this login created the draft.
    expect([200, 201]).toContain(mutation);

    // Revoking must actually end it: a reviewer or customer whose session was
    // revoked and whose tab keeps mutating is the failure this asserts against.
    const afterLogout = await page.evaluate(async (origin) => {
      const csrf = await (
        await fetch(`${origin}/api/v1/auth/csrf/`, { credentials: "include" })
      ).json();
      await fetch(`${origin}/api/v1/auth/logout/`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": csrf.csrf_token },
      });

      const retry = await (
        await fetch(`${origin}/api/v1/auth/csrf/`, { credentials: "include" })
      ).json();
      const response = await fetch(`${origin}/api/v1/partner/application/`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "X-CSRFToken": retry.csrf_token },
        body: JSON.stringify({ display_name: "Should Not Apply" }),
      });
      return response.status;
    }, API_ORIGIN);

    // 403, not 401: DRF's SessionAuthentication supplies no `WWW-Authenticate`
    // header, so an unauthenticated request is refused with 403 carrying
    // `not_authenticated`. What matters is that the mutation no longer
    // succeeds — and the client now reads that code as session loss.
    expect(afterLogout).toBe(403);
  });

  test("reports the anonymous session projection without a 401", async ({ page }) => {
    await page.goto("/apply", { waitUntil: "domcontentloaded" });

    const projection = await page.evaluate(async (origin) => {
      const response = await fetch(`${origin}/api/v1/auth/session/`, {
        credentials: "include",
      });
      return { status: response.status, body: await response.json() };
    }, API_ORIGIN);

    // Contract 1.3.0. Before this, discovering anonymity meant provoking an
    // authentication failure, which tripped cross-tab logout on every visit.
    expect(projection.status).toBe(200);
    expect(projection.body.user).toBeNull();
    expect(projection.body.active_role).toBeNull();
  });
});
