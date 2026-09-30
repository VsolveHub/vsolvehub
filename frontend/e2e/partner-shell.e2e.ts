import { expect, test, type Page } from "@playwright/test";

import {
  APPROVED_APPLICATION,
  AUTHENTICATED_PARTNER,
  PARTNER_ACTING_AS_CUSTOMER,
  envelope,
  installDispatchApi,
  offer,
  offerPageBody,
} from "./support/dispatch-api";

/**
 * The Partner signed-in shell, its login route and its home.
 *
 * FE-11 exists because every screen behind a session already worked and none of
 * them could be reached by clicking. The offer inbox, the availability editor
 * and the whole onboarding tree shipped complete while the marketing site's
 * "Login" link pointed at a route that did not exist. So the load-bearing test
 * here is the last one: an approved Partner getting from the front page to a
 * live offer using nothing but links.
 *
 * The rest guard the two things that are easy to get wrong once a login route
 * exists — where it sends people, and what it refuses to be talked into.
 */

const application = (status: string) => ({ ...APPROVED_APPLICATION, status });

/** Nothing in this suite depends on a real offer's contents, only that one shows. */
const offers = [{ body: offerPageBody({ results: [offer()] }) }];

/** Collects everything React or the browser complained about. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("where login sends people", () => {
  test("an approved Partner who is already signed in lands on the home", async ({ page }) => {
    await installDispatchApi(page, {
      session: AUTHENTICATED_PARTNER,
      application: application("APPROVED"),
      offerReads: offers,
    });

    await page.goto("/login");

    // Re-showing a login form to someone who is signed in is how people end up
    // logging in twice and still not arriving anywhere.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your work" })).toBeVisible();
  });

  test("an applicant with work left is sent to the application, not the home", async ({
    page,
  }) => {
    await installDispatchApi(page, {
      session: AUTHENTICATED_PARTNER,
      application: application("DRAFT"),
    });

    await page.goto("/login");

    await expect(page).toHaveURL(/\/apply$/);
  });

  test("a validated ?next= wins over the status-based target", async ({ page }) => {
    await installDispatchApi(page, {
      session: AUTHENTICATED_PARTNER,
      application: application("APPROVED"),
      offerReads: offers,
    });

    await page.goto("/login?next=%2Favailability");

    // `/dashboard` is where this Partner would otherwise go, so landing on
    // `/availability` proves the deep link survived rather than coincided.
    await expect(page).toHaveURL(/\/availability$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Your availability" }),
    ).toBeVisible();
  });

  test("signing in returns to the page that asked for a session", async ({ page }) => {
    await installDispatchApi(page, {
      signInOnOtpVerify: AUTHENTICATED_PARTNER,
      application: application("APPROVED"),
      offerReads: offers,
    });

    // Arriving at a protected route without a session is what produces the
    // `?next=`; the test drives that path rather than typing the parameter.
    await page.goto("/offers");
    await expect(page).toHaveURL(/\/login\?next=%2Foffers$/);

    await page.getByLabel(/mobile number/i).fill("9900000099");
    await page.getByRole("button", { name: /send code/i }).click();
    await page.getByLabel(/digit code/i).fill("123456");
    await page.getByRole("button", { name: /verify and continue/i }).click();

    await expect(page).toHaveURL(/\/offers$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your offers" })).toBeVisible();
  });
});

test.describe("what login refuses", () => {
  /**
   * An open redirect on a login route is a real vulnerability: the victim
   * authenticates against the genuine site and is then handed to an attacker's
   * page carrying the credibility of having just signed in.
   */
  for (const [name, next] of [
    ["an absolute URL", "https://evil.example"],
    ["a protocol-relative path", "//evil.example"],
    ["a backslash the browser normalises", "/\\evil.example"],
  ] as const) {
    test(`refuses ${name} and falls back to the safe target`, async ({ page }) => {
      await installDispatchApi(page, {
        session: AUTHENTICATED_PARTNER,
        application: application("APPROVED"),
        offerReads: offers,
      });

      await page.goto(`/login?next=${encodeURIComponent(next)}`);

      await expect(page).toHaveURL(/\/dashboard$/);
      // The strong assertion: still on our own origin, whatever the parameter said.
      expect(new URL(page.url()).host).toBe("localhost:3001");
    });
  }
});

test.describe("the home for each application state", () => {
  test("no application at all offers a way to start one", async ({ page }) => {
    // A Partner who has never applied gets a 404, which is a state the home has
    // a branch for rather than a failure to recover from.
    await installDispatchApi(page, {
      session: AUTHENTICATED_PARTNER,
      applicationResponse: { status: 404, body: envelope("not_found") },
    });

    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { level: 1, name: /start your application/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Offer services/ })).toHaveAttribute(
      "href",
      "/apply/about",
    );
    await expect(page.getByRole("button", { name: /List my property/ })).toBeVisible();
  });

  for (const status of ["DRAFT", "CHANGES_REQUIRED"] as const) {
    test(`${status} sends the Partner back to finish it`, async ({ page }) => {
      await installDispatchApi(page, {
        session: AUTHENTICATED_PARTNER,
        application: application(status),
      });

      await page.goto("/dashboard");

      await expect(
        page.getByRole("heading", { level: 1, name: "Your application" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /continue your application/i })).toBeVisible();
    });
  }

  for (const status of ["SUBMITTED", "UNDER_REVIEW"] as const) {
    test(`${status} says plainly that nothing is waiting on them`, async ({ page }) => {
      await installDispatchApi(page, {
        session: AUTHENTICATED_PARTNER,
        application: application(status),
      });

      await page.goto("/dashboard");

      await expect(page.getByText(/nothing waiting on you/i)).toBeVisible();
      // No inbox before approval: an empty one would read as "no work available".
      await expect(page.getByRole("heading", { name: /^offers$/i })).toHaveCount(0);
    });
  }

  for (const status of ["SUSPENDED", "OFFBOARDED"] as const) {
    test(`${status} shows the standing and no way to take work`, async ({ page }) => {
      await installDispatchApi(page, {
        session: AUTHENTICATED_PARTNER,
        application: application(status),
      });

      await page.goto("/dashboard");

      await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
      await expect(page.getByRole("link", { name: /set the hours you work/i })).toHaveCount(0);
    });
  }
});

test.describe("a Partner whose session is acting as a Customer", () => {
  /**
   * Not hypothetical: Django selects the alphabetically first grant at login, so
   * this is the default for anyone who is both. Treating it as a denial is how
   * they conclude their Partner account is broken.
   */
  test("is offered the switch on offers, not a dead refusal", async ({ page }) => {
    await installDispatchApi(page, {
      session: PARTNER_ACTING_AS_CUSTOMER,
      application: application("APPROVED"),
      offerReads: offers,
    });

    await page.goto("/offers");

    await expect(page.getByRole("button", { name: /switch to partner/i })).toBeVisible();
  });

  test("is offered the switch on the home, where the inbox would be", async ({ page }) => {
    await installDispatchApi(page, {
      session: PARTNER_ACTING_AS_CUSTOMER,
      application: application("APPROVED"),
      offerReads: offers,
    });

    await page.goto("/dashboard");

    await expect(page.getByRole("button", { name: /switch to partner/i })).toBeVisible();
  });
});

/**
 * The acceptance test for the whole task.
 *
 * Every screen it touches already existed and worked. What did not exist was any
 * sequence of clicks that reached them, which is the defect FE-11 was written to
 * fix — so this walks it with no `page.goto` after the first.
 */
test("an approved Partner reaches a live offer from the front page by clicking only", async ({
  page,
}) => {
  const errors = watchConsole(page);

  await installDispatchApi(page, {
    signInOnOtpVerify: AUTHENTICATED_PARTNER,
    application: application("APPROVED"),
    offerReads: offers,
  });

  await page.goto("/");

  await page.getByRole("link", { name: "Login", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel(/mobile number/i).fill("9900000099");
  await page.getByRole("button", { name: /send code/i }).click();
  await page.getByLabel(/digit code/i).fill("123456");
  await page.getByRole("button", { name: /verify and continue/i }).click();

  // Approved, so login lands on the home and the inbox is already there.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Fan installation").first()).toBeVisible();

  // And the nav reaches the dedicated route, which is the same inbox.
  await page.getByRole("link", { name: "Offers" }).click();
  await expect(page).toHaveURL(/\/offers$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your offers" })).toBeVisible();
  await expect(page.getByText("Fan installation").first()).toBeVisible();

  expect(errors).toEqual([]);
});
