import { expect, test } from "@playwright/test";

import { hasHeading, verifyResponsiveAccessibility } from "./support/responsive";

test("partner marketing home loads without console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("main").getByRole("link", { name: /become a partner/i }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("partner unknown routes show the partner boundary", async ({ page }) => {
  await page.goto("/not-in-m1-yet", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /partner page not found/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /back to partner home/i })).toHaveAttribute(
    "href",
    "/",
  );
});

/**
 * Contract-independent Partner routes.
 *
 * The `/apply/*` tree is absent: every page behind that shell needs a session,
 * and its first screen is the OTP form, which cannot complete without BE-01.
 */
verifyResponsiveAccessibility("partner", [
  { path: "/", ready: hasHeading },
  { path: "/pricing", ready: hasHeading },
  { path: "/contact", ready: hasHeading },
  { path: "/not-in-m1-yet", ready: hasHeading },
]);
