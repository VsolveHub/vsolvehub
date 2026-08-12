import { expect, test } from "@playwright/test";

import {
  draft,
  installRequirementApi,
  summary,
  timeline,
  timelineEvent,
  TWO_HOURS_AGO,
} from "./support/requirement-api";
import { verifyResponsiveAccessibility } from "./support/responsive";

/**
 * `M2-FE-211`, `M2-FE-213`, `M2-FE-214`, `M2-FE-215` in a real browser.
 *
 * These cover what jsdom structurally cannot, and one thing no unit test can
 * cover at all: that these screens are **reachable**. Until 12 August 2026 the
 * whole requirement feature existed and no route mounted it, and every unit
 * test in the tree passed the entire time.
 *
 * The four-screen flow is not here. Its catalog reads happen during a server
 * render, where `page.route` cannot reach — see `support/requirement-api.ts`.
 *
 * Django is intercepted with contract-shaped 1.21.0 payloads. These prove the
 * frontend against the published shapes; they do not prove Django produces
 * them, and for M2 that gap is real — Wave C0 shipped with no tests.
 */

test.describe("My requests", () => {
  test("is reachable and lists the Customer's requests", async ({ page }) => {
    await installRequirementApi(page);
    await page.goto("/requests");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your requests");
    await expect(page.getByRole("heading", { name: "Housekeeping staff" })).toBeVisible();
    await expect(page.getByText("You are hiring people for a period of time.")).toBeVisible();
  });

  test("survives the cursor envelope the server actually sends", async ({ page }) => {
    // The OpenAPI document declares a bare array here. If the client ever stops
    // reading the envelope, this is a blank list rather than an error — which
    // is exactly the failure that would reach production unnoticed.
    await installRequirementApi(page, { requirements: [summary(), summary({ id: "22222222-2222-2222-2222-222222222222" })] });
    await page.goto("/requests");

    await expect(page.getByRole("heading", { name: "Housekeeping staff" })).toHaveCount(2);
  });

  test("shows a delayed match as neither on track nor breached", async ({ page }) => {
    // The whole of `M2-FE-215` in one assertion. "Finding professionals" is a
    // reassuring label on a promise already broken; "SLA breached" asserts a
    // server transition with a refund attached that nobody authorised.
    await installRequirementApi(page, {
      requirements: [summary({ quote_delivery_deadline_at: TWO_HOURS_AGO })],
    });
    await page.goto("/requests");

    await expect(page.getByText(/quotes promised in/i)).toHaveCount(0);
    await expect(page.getByText(/taking longer/i)).toBeVisible();
  });

  test("distinguishes closed-because-nobody-covers-it from closed-because-we-were-late", async ({
    page,
  }) => {
    await installRequirementApi(page, {
      requirements: [
        summary({ status: "CLOSED_NO_SUPPLY", closure_reason: "NO_SUPPLY" }),
        summary({
          id: "33333333-3333-3333-3333-333333333333",
          status: "CLOSED_SLA_BREACH",
          closure_reason: "SLA_BREACH",
        }),
      ],
    });
    await page.goto("/requests");

    // Two closures, two different explanations and two different next steps.
    // Collapsing them into one "closed" is the failure `M2-FE-215` forbids.
    const rows = page.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(page.getByText(/nobody/i).first()).toBeVisible();
  });

  test("shows an empty state only when the read succeeded", async ({ page }) => {
    await installRequirementApi(page, { requirements: [] });
    await page.goto("/requests");

    await expect(page.getByText(/have not asked for anything yet/i)).toBeVisible();
  });

  test("shows a failure as a failure, never as an empty list", async ({ page }) => {
    // A dropped connection must never be able to tell a Customer they have
    // never asked for anything.
    await installRequirementApi(page, { requirementsStatus: 503 });
    await page.goto("/requests");

    await expect(page.getByText(/have not asked for anything yet/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  });
});

test.describe("one request", () => {
  const REQUEST = "/requests/11111111-1111-1111-1111-111111111111";

  test("shows the header and the timeline", async ({ page }) => {
    await installRequirementApi(page);
    await page.goto(REQUEST);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Housekeeping staff");
    await expect(page.getByRole("heading", { name: "What has happened" })).toBeVisible();
    await expect(page.getByText("You sent this request")).toBeVisible();
  });

  test("keeps the header when the timeline will not load", async ({ page }) => {
    // The load-bearing separation. A timeline that fails must not be able to
    // hide that the request closed and a refund is owed.
    await installRequirementApi(page, {
      detail: draft({ status: "CLOSED_SLA_BREACH" }),
      timelineStatus: 500,
    });
    await page.goto(REQUEST);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Housekeeping staff");
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  test("names no professional before the unlock", async ({ page }) => {
    // `DETAIL_ALLOWLIST` enforced end to end: the serializer is supposed to
    // withhold identities too, and this is what happens when it stops.
    await installRequirementApi(page, {
      timeline: timeline([
        timelineEvent({
          id: "wave-1",
          type: "MATCHING_WAVE_SENT",
          detail: { vendors_invited: 5, vendor_names: ["Ravi", "Sunil"], vendor_phone: "+919876543210" },
        }),
      ]),
    });
    await page.goto(REQUEST);

    await expect(page.getByText("5 professionals invited")).toBeVisible();
    await expect(page.getByText("Ravi")).toHaveCount(0);
    await expect(page.getByText("+919876543210")).toHaveCount(0);
  });

  test("draws an event type it does not recognise rather than dropping it", async ({ page }) => {
    // A gap in a record both parties argue from during a dispute reads as
    // "nothing happened".
    await installRequirementApi(page, {
      timeline: timeline([timelineEvent({ id: "e-9", type: "SOMETHING_NEW" })]),
    });
    await page.goto(REQUEST);

    await expect(page.getByText("Update")).toBeVisible();
  });

  test("warns what a change costs once professionals hold it", async ({ page }) => {
    // `M2-FE-211`. Both halves of the consequence, before anything is offered.
    await installRequirementApi(page, { detail: draft({ status: "MATCHING" }) });
    await page.goto(REQUEST);

    await expect(page.getByText(/everyone who was asked is told/i)).toBeVisible();
    await expect(page.getByText(/starts again from the change/i)).toBeVisible();
    // No confirmation, because there is no amend command to confirm into.
    await expect(page.getByRole("button", { name: /^change this request$/i })).toHaveCount(0);
  });

  test("offers a free edit while nobody has seen it", async ({ page }) => {
    await installRequirementApi(page, { detail: draft({ status: "DRAFT" }) });
    await page.goto(REQUEST);

    await expect(page.getByText(/nobody has seen this request yet/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /continue editing/i })).toBeVisible();
  });

  test("says nothing about editing a closed request", async ({ page }) => {
    await installRequirementApi(page, { detail: draft({ status: "CLOSED_EXPIRED" }) });
    await page.goto(REQUEST);

    await expect(page.getByText(/nobody has seen this request yet/i)).toHaveCount(0);
    await expect(page.getByText(/everyone who was asked is told/i)).toHaveCount(0);
  });

  test("fails closed on somebody else's request", async ({ page }) => {
    // M2 answers 404 rather than 403 for another Customer's record — existence
    // is itself private. Either way the screen must not offer a retry loop that
    // cannot succeed.
    await installRequirementApi(page, { detailStatus: 404 });
    await page.goto(REQUEST);

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  });
});

/**
 * `M2-FE-803`'s customer share for this route.
 *
 * Wrapped in a `beforeEach` that installs the API, on the same pattern as
 * `bookings.e2e.ts`: `RouteUnderTest` has no setup hook, and without one the
 * session gate in `RequestsLayout` would redirect to `/login` and the readiness
 * check would happily pass against that page's heading instead.
 *
 * The list is given two rows on purpose. A long Indian service name beside a
 * state badge and a countdown is what actually overflows a 320px viewport, and
 * an empty state never would.
 */
test.describe("requests responsiveness", () => {
  test.beforeEach(async ({ page }) => {
    await installRequirementApi(page, {
      requirements: [
        summary(),
        summary({
          id: "44444444-4444-4444-4444-444444444444",
          status: "CLOSED_SLA_BREACH",
          closure_reason: "SLA_BREACH",
        }),
      ],
    });
  });

  verifyResponsiveAccessibility("customer", [
    {
      path: "/requests",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1, name: "Your requests" })).toBeVisible();
      },
    },
  ]);
});
