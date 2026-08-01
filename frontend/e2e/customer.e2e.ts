import { expect, test } from "@playwright/test";

import { hasHeading, verifyResponsiveAccessibility } from "./support/responsive";

test("customer unknown routes show the M1 customer boundary", async ({ page }) => {
  await page.goto("/definitely-not-a-customer-route", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: /customer page does not exist/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /go to services/i })).toHaveAttribute(
    "href",
    "/catalog",
  );
});

/**
 * Contract-independent Customer routes.
 *
 * `/book/[service]` is deliberately absent: its first stage needs an
 * authenticated address list, so it cannot render past a login prompt until
 * BE-01/BE-02 land. Checking it today would test the login wall, not the
 * booking workspace.
 */
verifyResponsiveAccessibility("customer", [
  {
    path: "/catalog",
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 1, name: /all services/i })).toBeVisible();
    },
  },
  { path: "/catalog/technician", ready: hasHeading },
  { path: "/definitely-not-a-customer-route", ready: hasHeading },
]);
