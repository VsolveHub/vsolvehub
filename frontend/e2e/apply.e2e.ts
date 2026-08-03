import { expect, test, type Page } from "@playwright/test";

import { AUTHENTICATED_PARTNER, installDispatchApi } from "./support/dispatch-api";

/**
 * The Partner onboarding tree, in a browser.
 *
 * This suite exists because two page-breaking bugs shipped through a green gate:
 *
 *  - Four step pages were Server Components passing a render prop to a Client
 *    Component. React refused the tree with *"Functions are not valid as a child
 *    of Client Components"* and every one of those pages threw on navigation.
 *  - "Save and continue" saved and did not continue.
 *
 * Neither is detectable by a unit test of the components in isolation, a type
 * check, or a production build. Both are obvious within one second of opening
 * the page. `/apply/*` was excluded from the E2E matrix because it needs a
 * session — which was true, and is why these went unnoticed for two milestones.
 * The session is stubbed here.
 *
 * The console assertion is the load-bearing part: it is what turns "the page
 * rendered something" into "the page rendered without React giving up on it".
 */

const STEPS = [
  { path: "/apply", heading: /your application|start your application/i },
  { path: "/apply/about", heading: /about you/i },
  { path: "/apply/work", heading: /your work/i },
  { path: "/apply/areas", heading: /where you work/i },
  { path: "/apply/consent", heading: /agreements/i },
  { path: "/apply/documents", heading: /documents/i },
  { path: "/apply/schedule", heading: /hours/i },
  { path: "/apply/review", heading: /review/i },
] as const;

const DRAFT_APPLICATION = {
  id: "app-1",
  partner_id: "p-1",
  status: "DRAFT",
  version: 2,
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

/** Collects everything React or the browser complained about. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/**
 * Errors that are about the environment rather than the page.
 *
 * A failed API request logs to the console by design — the browser does that for
 * every 4xx — so a stubbed endpoint this suite does not model would otherwise
 * fail every test for the wrong reason. React's own refusals are never filtered.
 */
function isEnvironmental(message: string): boolean {
  return /Failed to load resource|net::ERR_|404 \(Not Found\)/.test(message);
}

async function setUp(page: Page) {
  await installDispatchApi(page, {
    session: AUTHENTICATED_PARTNER,
    application: DRAFT_APPLICATION,
  });
}

test.describe("every onboarding step renders", () => {
  for (const step of STEPS) {
    test(`${step.path} renders without React refusing the tree`, async ({ page }) => {
      const errors = watchConsole(page);
      await setUp(page);

      await page.goto(step.path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

      const real = errors.filter((message) => !isEnvironmental(message));
      expect(
        real,
        `${step.path} logged a React or runtime error. The render-prop-across-the-` +
          `server-boundary bug looked exactly like this.`,
      ).toEqual([]);

      // The error boundary's copy, which is what a broken step actually shows.
      await expect(page.getByText(/could not open your application/i)).toHaveCount(0);
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    });
  }
});

test.describe("the step navigation says where you are", () => {
  test("marks the current step and only that one", async ({ page }) => {
    await setUp(page);
    await page.goto("/apply/areas");

    const nav = page.getByRole("navigation", { name: /application steps/i });
    await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
    await expect(nav.locator("[aria-current='page']")).toHaveText("Where you work");
  });

  test("moves the marker as the applicant moves", async ({ page }) => {
    await setUp(page);
    await page.goto("/apply/about");

    const nav = page.getByRole("navigation", { name: /application steps/i });
    await expect(nav.locator("[aria-current='page']")).toHaveText("About you");

    await nav.getByRole("link", { name: "Agreements" }).click();
    await expect(nav.locator("[aria-current='page']")).toHaveText("Agreements");
  });
});

test.describe("save and continue", () => {
  test("advances to the next step after a successful save", async ({ page }) => {
    // The user-reported bug: the button saved and stayed put, so the applicant
    // had to find the next tab themselves.
    await installDispatchApi(page, {
      session: AUTHENTICATED_PARTNER,
      application: DRAFT_APPLICATION,
    });
    await page.route("**/api/v1/partner/application/", async (route) => {
      const method = route.request().method();
      const headers = {
        "access-control-allow-origin": "http://localhost:3001",
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
      };
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify(
          method === "PATCH"
            ? { ...DRAFT_APPLICATION, version: 3, display_name: "Ravi Kumar" }
            : DRAFT_APPLICATION,
        ),
      });
    });

    await page.goto("/apply/about");

    const name = page.getByLabel(/name customers will see/i);
    await name.fill("Ravi Kumar");
    await page.getByRole("button", { name: /save and continue/i }).click();

    await expect(page).toHaveURL(/\/apply\/work$/);
    await expect(page.getByRole("heading", { level: 1, name: /your work/i })).toBeVisible();
  });

  test("stays on the step when the save is refused", async ({ page }) => {
    // Moving on from work the server did not keep is worse than not moving:
    // the applicant never sees why it failed.
    await installDispatchApi(page, {
      session: AUTHENTICATED_PARTNER,
      application: DRAFT_APPLICATION,
    });
    await page.route("**/api/v1/partner/application/", async (route) => {
      const method = route.request().method();
      const headers = {
        "access-control-allow-origin": "http://localhost:3001",
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
      };
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers, body: "" });
        return;
      }
      if (method === "PATCH") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          headers,
          body: JSON.stringify({
            error: {
              code: "partner_application_version_conflict",
              message: "Refused.",
              details: null,
              retryable: true,
              request_id: "r",
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify(DRAFT_APPLICATION),
      });
    });

    await page.goto("/apply/about");
    await page.getByLabel(/name customers will see/i).fill("Ravi Kumar");
    await page.getByRole("button", { name: /save and continue/i }).click();

    await expect(page.getByText(/someone else changed this application/i)).toBeVisible();
    await expect(page).toHaveURL(/\/apply\/about$/);
  });
});
