import { expect, test } from "@playwright/test";

import { hasHeading, verifyResponsiveAccessibility } from "./support/responsive";

test("operations entry offers staff sign-in", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: /operations/i })).toBeVisible();
  await expect(page.getByLabel(/mobile number/i)).toBeVisible();
});

test("operations entry does not publish internal readiness to anonymous visitors", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const body = (await page.locator("body").textContent()) ?? "";

  // An unauthenticated origin must not describe where the system is soft: which
  // endpoints are missing, which client is stale, which guard does not exist.
  for (const leak of [
    /backend blocker/i,
    /not routable/i,
    /generated client/i,
    /role guard/i,
    /stale/i,
    /endpoint/i,
  ]) {
    expect(body, `Operations home leaked internal readiness: ${leak}`).not.toMatch(leak);
  }
});

test("operations sign-in does not claim access before Django grants it", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // The console itself must not be reachable by an anonymous visitor, and the
  // form must not pretend a code was sent before the server issued one.
  await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
  await expect(page.getByText(/nothing assigned to you yet/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /send code/i })).toBeDisabled();
});

test("operations unknown routes show the operations boundary", async ({ page }) => {
  await page.goto("/reviews/not-yet", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /console page not found/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/");
});

/** The Operations sign-in screen is the only route reachable without a session. */
verifyResponsiveAccessibility("operations", [
  {
    path: "/",
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 1, name: /operations/i })).toBeVisible();
    },
  },
  { path: "/reviews/not-yet", ready: hasHeading },
]);
