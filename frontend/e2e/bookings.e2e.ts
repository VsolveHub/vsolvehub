import { expect, test } from "@playwright/test";

import {
  TWO_UNIT_GROUP,
  envelope,
  group,
  installDispatchApi,
  unit,
  unitLine,
} from "./support/dispatch-api";
import { verifyResponsiveAccessibility } from "./support/responsive";

/**
 * FE-09 Customer group finding and recovery, in a real browser.
 *
 * The scenarios here need things jsdom cannot give: a poll that actually fires
 * on a timer and picks up a changed server answer, a native `<dialog>` that
 * really traps focus, and a page that still holds together at 200% zoom.
 *
 * Django is intercepted with contract-shaped 1.10.0 payloads — see
 * `support/dispatch-api.ts` for the boundary that keeps these from being
 * mistaken for backend proof.
 */

test.describe("watching a booking", () => {
  test("shows each visit's own status without implying the booking is confirmed", async ({
    page,
  }) => {
    await installDispatchApi(page, {
      groupReads: [
        {
          body: group({
            status: "PARTIALLY_HELD",
            units: [
              unit({ id: "fu-1", position: 0, status: "HELD" }),
              unit({
                id: "fu-2",
                position: 1,
                status: "MATCHING",
                lines: [unitLine({ id: "ul-2", label: "Geyser repair" })],
              }),
            ],
          }),
        },
      ],
    });
    await page.goto("/bookings/group-1");

    // Scoped per card rather than per page: the point is that each unit shows
    // *its own* status, which a page-wide text match would not distinguish from
    // both statuses appearing anywhere.
    const firstVisit = page.locator("li").filter({ hasText: "Visit 1 of 2" });
    const secondVisit = page.locator("li").filter({ hasText: "Visit 2 of 2" });

    await expect(firstVisit.getByText("Professional held", { exact: true })).toBeVisible();
    await expect(secondVisit.getByText("Finding a professional", { exact: true })).toBeVisible();
    await expect(secondVisit.getByText("Geyser repair")).toBeVisible();

    // The property this whole screen is defending.
    await expect(
      page.getByText(/nothing is confirmed until every visit has a professional/i),
    ).toBeVisible();
    await expect(page.getByText(/booked together or not at all/i)).toBeVisible();
    await expect(page.getByText(/partially confirmed/i)).toHaveCount(0);
  });

  test("picks up a change the customer did nothing to cause", async ({ page }) => {
    // The reason the poll exists: the group moves because Celery moved it.
    const api = await installDispatchApi(page, {
      groupReads: [
        { body: group({ status: "MATCHING" }) },
        { body: group({ status: "ALL_UNITS_HELD", units: [unit({ status: "HELD" })] }) },
      ],
    });
    await page.goto("/bookings/group-1");

    await expect(page.getByText("Finding professionals")).toBeVisible();
    await expect(page.getByText("All professionals held")).toBeVisible({ timeout: 20_000 });
    expect(api.matching("/api/v1/booking-groups/group-1/").length).toBeGreaterThan(1);
  });

  test("stops polling once the booking can no longer change", async ({ page }) => {
    const api = await installDispatchApi(page, {
      groupReads: [{ body: group({ status: "BOOKED", recovery_action: "NONE" }) }],
    });
    await page.goto("/bookings/group-1");

    await expect(page.getByText(/will not change again/i)).toBeVisible();

    const afterFirstRead = api.matching("/api/v1/booking-groups/group-1/").length;
    await page.waitForTimeout(13_000);
    expect(api.matching("/api/v1/booking-groups/group-1/").length).toBe(afterFirstRead);
  });

  test("never asks the server to advance dispatch", async ({ page }) => {
    // Progress is Celery's. A browser that could advance it would make a booking
    // depend on someone keeping a tab open.
    const api = await installDispatchApi(page, {
      groupReads: [{ body: group({ status: "MATCHING" }) }],
    });
    await page.goto("/bookings/group-1");
    await expect(page.getByText("Finding professionals")).toBeVisible();
    await page.waitForTimeout(12_000);

    expect(api.calls.filter((call) => call.url.includes("/advance/"))).toHaveLength(0);
    expect(api.calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });
});

test.describe("recovery is the server's instruction", () => {
  test("offers a replan only when the server asks for one", async ({ page }) => {
    await installDispatchApi(page, {
      groupReads: [
        {
          body: group({
            status: "REPLAN_REQUIRED",
            recovery_action: "REPLAN",
            units: [unit({ status: "FAILED" })],
          }),
        },
      ],
    });
    await page.goto("/bookings/group-1");

    await expect(page.getByTestId("recovery-action")).toContainText(/choose a new arrangement/i);
    await expect(page.getByRole("link", { name: /choose a new arrangement/i })).toHaveAttribute(
      "href",
      "/cart",
    );
    await expect(page.getByText(/any holds have been released/i)).toBeVisible();
  });

  test("offers nothing when the server says there is nothing to do", async ({ page }) => {
    await installDispatchApi(page, {
      groupReads: [{ body: group({ status: "BOOKED", recovery_action: "NONE" }) }],
    });
    await page.goto("/bookings/group-1");

    await expect(page.getByText(/everything is confirmed/i)).toBeVisible();
    await expect(page.getByTestId("recovery-action")).toHaveCount(0);
  });
});

test.describe("cancelling", () => {
  test("confirms in a keyboard-operable dialog and sends the version on screen", async ({
    page,
  }) => {
    const cancelled = group({ status: "CANCELLED", version: 5, recovery_action: "NONE" });
    const api = await installDispatchApi(page, {
      // Two reads, because that is what the server would do: the group is
      // MATCHING until the command lands, and CANCELLED on every read after. A
      // harness that kept answering MATCHING would have the poll overwrite the
      // command's own result — which is a bug in the fixture, not the app.
      groupReads: [{ body: group({ status: "MATCHING", version: 4 }) }, { body: cancelled }],
      cancel: { body: cancelled },
    });
    await page.goto("/bookings/group-1");

    await page.getByRole("button", { name: /cancel this booking/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(/cancel this booking\?/i);

    // Focus is inside the modal, so a keyboard user is not left behind it.
    expect(
      await page.evaluate(() => {
        const element = document.querySelector("dialog[open]");
        return element instanceof HTMLElement && element.contains(document.activeElement);
      }),
    ).toBe(true);

    await dialog.getByRole("button", { name: /cancel this booking/i }).click();

    await expect(page.getByText(/this booking was cancelled/i)).toBeVisible();

    const cancelCall = api.matching("/api/v1/booking-groups/group-1/cancel/")[0];
    expect(cancelCall?.body).toEqual({ expected_version: 4 });
    expect(cancelCall?.headers["idempotency-key"]).toBeTruthy();
  });

  test("Escape closes the confirmation without cancelling anything", async ({ page }) => {
    const api = await installDispatchApi(page, {
      groupReads: [{ body: group({ status: "MATCHING" }) }],
    });
    await page.goto("/bookings/group-1");

    await page.getByRole("button", { name: /cancel this booking/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(api.matching("/api/v1/booking-groups/group-1/cancel/")).toHaveLength(0);
  });

  test("a version conflict sends the customer back to truth, not to a retry", async ({ page }) => {
    const api = await installDispatchApi(page, {
      groupReads: [{ body: group({ status: "MATCHING", version: 4 }) }],
      cancel: { status: 409, body: envelope("booking_group_version_conflict") },
    });
    await page.goto("/bookings/group-1");

    await page.getByRole("button", { name: /cancel this booking/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /cancel this booking/i })
      .click();

    await expect(page.getByRole("alert").first()).toContainText(
      /changed while you were deciding/i,
    );
    // Sent once. A refusal means the world changed, so resending would cancel
    // against a state the customer never saw.
    expect(api.matching("/api/v1/booking-groups/group-1/cancel/")).toHaveLength(1);
    await expect(page.getByText(/your booking was cancelled/i)).toHaveCount(0);
  });

  test("offers no cancellation on a finished booking", async ({ page }) => {
    await installDispatchApi(page, {
      groupReads: [{ body: group({ status: "BOOKED", recovery_action: "NONE" }) }],
    });
    await page.goto("/bookings/group-1");

    await expect(page.getByText(/everything is confirmed/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel this booking/i })).toHaveCount(0);
  });

  test("opens each paid visit from its overview card", async ({ page }) => {
    await installDispatchApi(page, {
      groupReads: [
        {
          body: group({
            status: "BOOKED",
            recovery_action: "NONE",
            order_id: "order-1",
            units: [
              unit({
                id: "fu-1",
                position: 0,
                status: "BOOKED",
                booking_id: "booking-1",
                booking_status: "CONFIRMED",
                professional: {
                  display_name: "Carpenter Pro",
                  headline: "Bed Assembly",
                  experience_years: 5,
                },
              }),
              unit({
                id: "fu-2",
                position: 1,
                status: "BOOKED",
                booking_id: "booking-2",
                booking_status: "CONFIRMED",
                lines: [unitLine({ id: "ul-2", label: "Switch Board Replacement" })],
                professional: {
                  display_name: "Switch Pro",
                  headline: "Junction Box Fixing",
                  experience_years: 5,
                },
              }),
            ],
          }),
        },
      ],
      bookingReads: [
        {
          body: {
            id: "booking-1",
            fulfilment_unit_id: "fu-1",
            status: "CONFIRMED",
            version: 1,
            scheduled_start: "2026-08-04T10:00:00Z",
            estimated_duration_minutes: 45,
            partner_display_name: "Carpenter Pro",
            en_route_at: null,
            arrived_at: null,
            work_tasks: [],
            completion: null,
            reschedule_preview: { is_available: true, unavailable_reason: "" },
            scope_amendments: [],
            server_now: "2026-08-03T09:00:00Z",
            next_transition_at: null,
          },
        },
      ],
    });
    await page.goto("/bookings/group-1");

    await expect(page.getByRole("heading", { name: "Visit 1 of 2" })).toBeVisible();
    await page.getByRole("link", { name: /view details/i }).first().click();

    await expect(page).toHaveURL("/bookings/group-1/visits/booking-1");
    await expect(page.getByRole("heading", { name: "Visit 1 of 2" })).toBeVisible();
    await expect(page.getByText("Real Partner Details Unlocked")).toBeVisible();
    await expect(page.getByText("Visit total")).toBeVisible();
    await expect(page.getByRole("link", { name: /back to this booking/i })).toHaveAttribute(
      "href",
      "/bookings/group-1",
    );
  });
});

test.describe("the bookings list", () => {
  test("lists bookings and links to each one", async ({ page }) => {
    await installDispatchApi(page, {
      groupPage: { body: { next: null, previous: null, results: [TWO_UNIT_GROUP] } },
    });
    await page.goto("/bookings");

    await expect(page.getByRole("heading", { level: 1, name: "Your bookings" })).toBeVisible();
    await expect(page.getByRole("link", { name: /2 visits/i })).toHaveAttribute(
      "href",
      "/bookings/group-1",
    );
  });

  test("loads further pages through the opaque cursor, preserving order", async ({ page }) => {
    const pageTwoGroup = {
      ...TWO_UNIT_GROUP,
      id: "group-2",
      units: [
        {
          ...TWO_UNIT_GROUP.units[0],
          id: "fu-3",
          lines: [{ ...TWO_UNIT_GROUP.units[0]!.lines[0], label: "Geyser repair" }],
        },
      ],
    };

    await installDispatchApi(page, {
      groupPage: [
        {
          body: {
            next: "https://api.example/api/v1/booking-groups/?cursor=opaque-page-2",
            previous: null,
            results: [TWO_UNIT_GROUP],
          },
        },
        {
          body: {
            next: null,
            previous: null,
            results: [pageTwoGroup],
          },
        },
      ],
    });
    await page.goto("/bookings");

    await expect(page.getByRole("link", { name: /2 visits/i })).toBeVisible();
    await expect(page.getByText(/older ones are not listed/i)).toHaveCount(0);

    const nextResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/booking-groups/") &&
        new URL(response.url()).searchParams.get("cursor") === "opaque-page-2" &&
        response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "Load more" }).click();
    const response = await nextResponse;
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { results: { id: string }[] };
    expect(body.results[0]?.id).toBe("group-2");

    await expect(page.getByText(/geyser repair/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  });

  test("says so plainly when there is nothing to show", async ({ page }) => {
    await installDispatchApi(page, {
      groupPage: { body: { next: null, previous: null, results: [] } },
    });
    await page.goto("/bookings");

    await expect(page.getByText(/no bookings yet/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /browse services/i })).toBeVisible();
  });
});

test.describe("bookings responsiveness", () => {
  test.beforeEach(async ({ page }) => {
    await installDispatchApi(page, {
      groupPage: { body: { next: null, previous: null, results: [TWO_UNIT_GROUP] } },
    });
  });

  verifyResponsiveAccessibility("customer", [
    {
      path: "/bookings",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1, name: "Your bookings" })).toBeVisible();
      },
    },
  ]);
});
