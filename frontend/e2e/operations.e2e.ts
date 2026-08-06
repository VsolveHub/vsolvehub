import { expect, test } from "@playwright/test";

import { OPERATIONS_ACTING_AS_CUSTOMER, installOperationsApi } from "./support/operations-api";
import { hasHeading, verifyResponsiveAccessibility } from "./support/responsive";

/**
 * The signed-in Operations console.
 *
 * `admin.e2e.ts` covers the anonymous boundary and can only reach two routes,
 * because everything else in this app is behind a session. That gap is exactly
 * how `WorkspaceNav` shipped written-but-never-rendered, leaving four workspaces
 * reachable only by typing the URL — so the load-bearing test here is the last
 * one in the first block: every workspace reached from the home page by
 * clicking, and nothing else.
 *
 * The responsive and accessibility gate then runs over all seven, which is the
 * first time these routes have been measured at 375px or tabbed through at all.
 */

test.beforeEach(async ({ page }) => {
  await installOperationsApi(page);
});

test.describe("reaching the workspaces", () => {
  test("shows the console to a session Django says is acting as Operations", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Operations" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: /Operations workspaces/i }),
    ).toBeVisible();
  });

  test("offers the switch, not a refusal, when the grant is held but not selected", async ({
    page,
  }) => {
    // The front door for every staff sign-in: Django picks the alphabetically
    // first grant and re-grants `customer` on every login, so `customer` always
    // wins. A dead "no access" screen here would lock out every operator.
    await installOperationsApi(page, { session: OPERATIONS_ACTING_AS_CUSTOMER });
    await page.goto("/");

    await expect(page.getByRole("button", { name: /switch to operations/i })).toBeVisible();
    await expect(page.getByText(/do not have access/i)).toHaveCount(0);
  });

  test("reaches every workspace from the home page by clicking only", async ({ page }) => {
    await page.goto("/");

    const journey: { link: RegExp; heading: RegExp }[] = [
      { link: /^Partner applications$/, heading: /partner applications/i },
      { link: /^Compatibility rules$/, heading: /compatibility rules/i },
      { link: /^Dispatch recovery$/, heading: /dispatch recovery/i },
      { link: /^Offer work$/, heading: /offer work/i },
      { link: /^Assisted checkout$/, heading: /assisted checkout/i },
      { link: /^Partner availability$/, heading: /partner availability/i },
      { link: /^Refunds$/, heading: /refunds/i },
    ];

    for (const step of journey) {
      const nav = page.getByRole("navigation", { name: /Operations workspaces/i });
      await nav.getByRole("link", { name: step.link }).click();
      await expect(page.getByRole("heading", { level: 1, name: step.heading })).toBeVisible();
    }
  });

  test("marks the workspace being looked at", async ({ page }) => {
    await page.goto("/operations/dispatch");

    // An attribute locator, not `getByRole(..., { current })`: Playwright's role
    // engine has no `current` option, so that form silently matches every link
    // and the assertion stops meaning anything.
    const current = page.locator('nav a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("href", "/operations/dispatch");
  });
});

test.describe("what each workspace says before it is used", () => {
  test("dispatch recovery offers no command until a visit has been read", async ({ page }) => {
    // Every command is guarded on the version that read publishes. Offering them
    // first would be asking an operator to guess the guard.
    await page.goto("/operations/dispatch");

    await expect(page.getByText(/load a visit first/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /revoke this offer/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /run recovery/i })).toHaveCount(0);
  });

  test("refunds asks for a fresh confirmation and counts nothing down", async ({ page }) => {
    // `OPERATIONS_STEP_UP_TTL_SECONDS` is unpublished, so a timer here would be a
    // number invented about an authorization decision.
    await page.goto("/finance");

    await expect(page.getByRole("heading", { name: /confirm it is you/i })).toBeVisible();
    await expect(page.getByText(/how long is the server's decision/i)).toBeVisible();
  });

  test("partner availability warns that saving replaces the whole week", async ({ page }) => {
    await page.goto("/operations/partner-availability");

    await expect(
      page.getByRole("heading", { name: /replaces the Partner's whole week/i }),
    ).toBeVisible();
  });

  test("the console renders without a browser console error", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    for (const path of ["/", "/operations/dispatch", "/finance"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }

    expect(errors).toEqual([]);
  });
});

verifyResponsiveAccessibility("operations signed in", [
  { path: "/", ready: hasHeading },
  { path: "/reviews", ready: hasHeading },
  { path: "/operations/compatibility-rules", ready: hasHeading },
  { path: "/operations/dispatch", ready: hasHeading },
  { path: "/operations/manual-offers", ready: hasHeading },
  { path: "/operations/assisted-checkouts", ready: hasHeading },
  { path: "/operations/partner-availability", ready: hasHeading },
  { path: "/finance", ready: hasHeading },
]);
