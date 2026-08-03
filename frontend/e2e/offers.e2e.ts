import { expect, test } from "@playwright/test";

import {
  AUTHENTICATED_PARTNER,
  envelope,
  installDispatchApi,
  offer,
  offerServiceLine,
} from "./support/dispatch-api";
import { verifyResponsiveAccessibility } from "./support/responsive";

/**
 * FE-09 Partner offer inbox, in a real browser.
 *
 * Two things here need a browser rather than jsdom: a poll that fires on a
 * timer and notices an offer the Partner did nothing to change, and the
 * in-flight window where a control must genuinely refuse a second press.
 *
 * The scenario worth the most is "a lost response must not read as a lost job" —
 * see `contracts/proposals/0009-partner-offer-command-contract.md`.
 */

const partner = { session: AUTHENTICATED_PARTNER };

test.describe("the inbox", () => {
  test("shows one Fulfilment Unit's scope, area, timing and full pay breakdown", async ({
    page,
  }) => {
    await installDispatchApi(page, {
      ...partner,
      offerReads: [{ body: { next: null, previous: null, results: [offer()] } }],
    });
    await page.goto("/offers");

    await expect(page.getByRole("heading", { level: 1, name: "Your offers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Jubilee Hills" })).toBeVisible();
    await expect(page.getByText("Fan installation")).toBeVisible();
    await expect(page.getByText("Ladder")).toBeVisible();

    // All three money lines. Gross alone is the number a Partner remembers and
    // not the one they are paid.
    await expect(page.getByText("₹249", { exact: true })).toBeVisible();
    await expect(page.getByText("₹49.80")).toBeVisible();
    await expect(page.getByText("₹199.20")).toBeVisible();
  });

  test("shows a countdown measured against the server clock, not the device's", async ({
    page,
  }) => {
    // The harness dates every response 09:00 and the offer expires at 10:00, so
    // about an hour must show *regardless of this machine's clock* — which in
    // practice is hours away from the fixture.
    //
    // This is the assertion that found proposal 0010: it originally rendered the
    // device clock's answer, because `Date` is not CORS-exposed by production
    // Django and `serverClock` was therefore never calibrated. The harness now
    // exposes the header, so what this proves is that the frontend does the
    // right thing the moment the backend does.
    await installDispatchApi(page, {
      ...partner,
      offerReads: [{ body: { next: null, previous: null, results: [offer()] } }],
    });
    await page.goto("/offers");

    await expect(page.getByText(/to respond/)).toBeVisible();
    await expect(page.locator("[data-numeric]").first()).toHaveText(/^(59:\d\d|1:00:00)$/);
    await expect(page.getByText(/about 1 hour left|about 60 minutes left/)).toBeAttached();
  });

  test("exposes no sibling unit, Customer or exact address", async ({ page }) => {
    const api = await installDispatchApi(page, {
      ...partner,
      offerReads: [
        {
          body: {
            next: null,
            previous: null,
            results: [offer({ service_lines: [offerServiceLine()] })],
          },
        },
      ],
    });
    await page.goto("/offers");
    await expect(page.getByRole("heading", { name: "Jubilee Hills" })).toBeVisible();

    // Nothing joins out to fetch what the projection withheld.
    expect(api.calls.filter((call) => call.url.includes("/booking-groups/"))).toHaveLength(0);
    expect(api.calls.filter((call) => call.url.includes("/checkouts/"))).toHaveLength(0);
    await expect(page.getByRole("link", { name: /map|directions/i })).toHaveCount(0);
  });

  test("says the list is truncated rather than presenting a partial one as complete", async ({
    page,
  }) => {
    await installDispatchApi(page, {
      ...partner,
      offerReads: [
        {
          body: {
            next: "https://api.example/api/v1/partner/offers/?cursor=x",
            previous: null,
            results: [offer()],
          },
        },
      ],
    });
    await page.goto("/offers");

    await expect(page.getByText(/more than fit on this page/i)).toBeVisible();
  });

  test("says no offers rather than implying something failed", async ({ page }) => {
    await installDispatchApi(page, {
      ...partner,
      offerReads: [{ body: { next: null, previous: null, results: [] } }],
    });
    await page.goto("/offers");

    await expect(page.getByText(/no offers right now/i)).toBeVisible();
    await expect(page.getByText(/make sure you are online/i)).toBeVisible();
  });

  test("tells an unapproved applicant why, instead of showing an empty inbox", async ({
    page,
  }) => {
    // "No offers right now" is technically true and completely misleading here:
    // it reads as no work available rather than not yet able to receive work.
    await installDispatchApi(page, {
      ...partner,
      application: { id: "app-1", status: "UNDER_REVIEW", version: 1, consents: [], documents: [], transitions: [] },
    });
    await page.goto("/offers");

    await expect(page.getByText(/not approved to take work yet/i)).toBeVisible();
    await expect(page.getByText(/no offers right now/i)).toHaveCount(0);
  });
});

test.describe("accepting", () => {
  test("moves into the undo window and offers commit or undo", async ({ page }) => {
    const api = await installDispatchApi(page, {
      ...partner,
      offerReads: [{ body: { next: null, previous: null, results: [offer()] } }],
      offerCommands: [
        {
          body: offer({
            status: "ACCEPTED_PENDING_UNDO",
            undo_deadline: "2026-08-03T09:02:00Z",
          }),
        },
      ],
    });
    await page.goto("/offers");

    await page.getByRole("button", { name: "Accept" }).click();

    await expect(page.getByText(/this is yours/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /commit now/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /undo — no penalty/i })).toBeVisible();
    await expect(page.getByText(/left to undo/)).toBeVisible();

    const command = api.matching("/api/v1/partner/offers/offer-1/accept/")[0];
    expect(command?.method).toBe("POST");
  });

  test("cannot be double-submitted while the command is in flight", async ({ page }) => {
    await installDispatchApi(page, {
      ...partner,
      offerReads: [{ body: { next: null, previous: null, results: [offer()] } }],
    });

    let accepts = 0;
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route("**/api/v1/partner/offers/*/accept/", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "http://localhost:3001",
            "access-control-allow-credentials": "true",
            "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
            "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
          },
          body: "",
        });
        return;
      }
      accepts += 1;
      await held;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "http://localhost:3001",
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify(
          offer({ status: "ACCEPTED_PENDING_UNDO", undo_deadline: "2026-08-03T09:02:00Z" }),
        ),
      });
    });

    await page.goto("/offers");
    const accept = page.getByRole("button", { name: "Accept" });
    await accept.click();

    // The command is not idempotent (proposal 0009), so this is the only thing
    // standing between a double-tap and an ambiguous second request.
    await expect(page.getByRole("button", { name: /accepting/i })).toBeDisabled();
    await page.getByRole("button", { name: /accepting/i }).click({ force: true, timeout: 2_000 }).catch(() => undefined);
    expect(accepts).toBe(1);

    release?.();
    await expect(page.getByText(/this is yours/i)).toBeVisible();
    expect(accepts).toBe(1);
  });
});

test.describe("a command whose outcome cannot be known", () => {
  test("never tells a Partner they lost a job they may hold", async ({ page }) => {
    // The scenario proposal 0009 exists for. The command is state-guarded, so a
    // retry after a lost response answers `offer_invalid` whether the Partner
    // missed the offer or already holds it.
    const api = await installDispatchApi(page, {
      ...partner,
      offerReads: [
        { body: { next: null, previous: null, results: [offer()] } },
        // The re-read is what actually answers: they had it all along.
        {
          body: {
            next: null,
            previous: null,
            results: [
              offer({ status: "ACCEPTED_PENDING_UNDO", undo_deadline: "2026-08-03T09:02:00Z" }),
            ],
          },
        },
      ],
      offerCommands: [{ status: 400, body: envelope("offer_invalid") }],
    });
    await page.goto("/offers");

    await page.getByRole("button", { name: "Accept" }).click();

    const alert = page.getByRole("alert").first();
    await expect(alert).toContainText(/could not confirm/i);
    await expect(alert).toContainText(/do not assume you lost it/i);
    await expect(alert).not.toContainText(/no longer available/i);

    // And the re-read resolves it into the truth.
    await expect(page.getByText(/this is yours/i)).toBeVisible({ timeout: 15_000 });
    expect(api.to("/api/v1/partner/offers/").length).toBeGreaterThan(1);
  });

  test("does not resend the command automatically", async ({ page }) => {
    const api = await installDispatchApi(page, {
      ...partner,
      offerReads: [{ body: { next: null, previous: null, results: [offer()] } }],
      offerCommands: [{ status: 400, body: envelope("offer_invalid") }],
    });
    await page.goto("/offers");

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await page.waitForTimeout(3_000);

    expect(api.matching("/api/v1/partner/offers/offer-1/accept/")).toHaveLength(1);
  });
});

test.describe("polling is bounded", () => {
  test("notices an offer that arrived without the Partner doing anything", async ({ page }) => {
    await installDispatchApi(page, {
      ...partner,
      offerReads: [
        { body: { next: null, previous: null, results: [] } },
        { body: { next: null, previous: null, results: [offer()] } },
      ],
    });
    await page.goto("/offers");

    await expect(page.getByText(/no offers right now/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Jubilee Hills" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("stops once every offer has settled", async ({ page }) => {
    const api = await installDispatchApi(page, {
      ...partner,
      offerReads: [
        { body: { next: null, previous: null, results: [offer({ status: "COMMITTED" })] } },
      ],
    });
    await page.goto("/offers");
    await expect(page.getByText("Committed", { exact: true })).toBeVisible();

    const afterFirst = api.to("/api/v1/partner/offers/").length;
    await page.waitForTimeout(12_000);
    expect(api.to("/api/v1/partner/offers/").length).toBe(afterFirst);
  });
});

test.describe("offers responsiveness", () => {
  test.beforeEach(async ({ page }) => {
    await installDispatchApi(page, {
      ...partner,
      offerReads: [{ body: { next: null, previous: null, results: [offer()] } }],
    });
  });

  verifyResponsiveAccessibility("partner", [
    {
      path: "/offers",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1, name: "Your offers" })).toBeVisible();
      },
    },
  ]);
});
