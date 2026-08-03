import { expect, test, type Page } from "@playwright/test";

import {
  ADDRESS,
  ANONYMOUS_SESSION,
  PREFERRED_START,
  TWO_ITEM_CART,
  cart,
  cartItem,
  checkout,
  envelope,
  groupQuote,
  installCartApi,
  mergeConflictDetails,
  planSet,
} from "./support/cart-api";
import { verifyResponsiveAccessibility } from "./support/responsive";

/**
 * FE-08G acceptance in a real browser.
 *
 * These cover what jsdom structurally cannot: the native `<dialog>`'s focus
 * trap and Escape handling, a disabled button surviving a genuine double-click,
 * focus actually landing on the step a customer was moved to, and the page
 * holding together at 200% zoom.
 *
 * Django is intercepted with contract-shaped 1.9.0 payloads — see
 * `support/cart-api.ts` for why, and for the boundary that keeps these from
 * being mistaken for backend proof.
 */

test.describe("a cart with more than one service", () => {
  test("shows both services as independent items, neither replacing the other", async ({
    page,
  }) => {
    await installCartApi(page);
    await page.goto("/cart");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your booking");
    await expect(page.getByRole("heading", { name: "Fan installation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Geyser repair" })).toBeVisible();
    await expect(page.getByText("2 services")).toBeVisible();

    // Each row carries its own quantity control, not one shared stepper.
    await expect(page.getByRole("button", { name: /increase .* quantity/i })).toHaveCount(2);
  });

  test("edits one item's quantity and carries that item's own version", async ({ page }) => {
    const api = await installCartApi(page, {
      patchItem: {
        body: cart({
          version: 4,
          items: [
            cartItem({ id: "item-1", service_name: "Fan installation", version: 2, quantity: 2 }),
            cartItem({ id: "item-2", service_name: "Geyser repair", quantity: 1 }),
          ],
        }),
      },
    });
    await page.goto("/cart");

    await page.getByRole("button", { name: /increase fan installation/i }).click();

    await expect(page.getByText(/saved version/)).toContainText("4");

    const patch = api.to("/api/v1/cart/items/item-1/")[0];
    expect(patch?.method).toBe("PATCH");
    expect(patch?.body).toMatchObject({
      expected_cart_version: 3,
      expected_item_version: 1,
      quantity: 2,
    });

    // The other item is untouched, which is the property the whole cart rests on.
    const geyser = page.getByRole("heading", { name: "Geyser repair" }).locator("xpath=../../..");
    await expect(geyser.getByRole("status")).toHaveText("1");
  });

  test("keeps removal honestly unavailable while the contract lacks its request body", async ({
    page,
  }) => {
    await installCartApi(page);
    await page.goto("/cart");

    await expect(page.getByRole("heading", { name: "Fan installation" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    await expect(
      page.getByText(/removing a service is not available yet/i).first(),
    ).toBeVisible();
  });

  test("recovers from a stale cart version by re-reading server truth", async ({ page }) => {
    const api = await installCartApi(page, {
      cart: [
        TWO_ITEM_CART,
        cart({
          version: 9,
          items: [
            cartItem({ id: "item-1", service_name: "Fan installation" }),
            cartItem({ id: "item-2", service_name: "Geyser repair" }),
          ],
        }),
      ],
      patchItem: {
        status: 409,
        body: envelope("cart_version_conflict", { current_version: 9 }),
      },
    });
    await page.goto("/cart");

    await page.getByRole("button", { name: /increase fan installation/i }).click();

    await expect(page.getByRole("alert").first()).toContainText(/changed somewhere else/i);
    // The recovery is a refetch, not a local correction: the version on screen
    // becomes the one the server actually holds.
    await expect(page.getByText(/saved version/)).toContainText("9");
    expect(api.to("/api/v1/cart/").length).toBeGreaterThan(1);
  });

  test("cannot double-submit a quantity change while one is in flight", async ({ page }) => {
    await installCartApi(page);

    // Hold the response open. A double-tap is only dangerous during the window
    // where the first command has not answered yet, so a test that lets the
    // request finish first proves nothing — it just clicks twice on an idle
    // button, which is two legitimate increments.
    let patchCount = 0;
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route("**/api/v1/cart/items/*/", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "http://localhost:3000",
            "access-control-allow-credentials": "true",
            "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
            "access-control-allow-headers": "content-type,x-csrftoken,idempotency-key",
          },
          body: "",
        });
        return;
      }
      patchCount += 1;
      await held;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "http://localhost:3000",
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify(
          cart({ version: 4, items: [cartItem({ id: "item-1", version: 2, quantity: 2 })] }),
        ),
      });
    });

    await page.goto("/cart");

    const increase = page.getByRole("button", { name: /increase fan installation/i });
    await increase.click();

    // The control is out of action for the whole in-flight window, and says so
    // to assistive technology rather than only looking inert.
    await expect(increase).toBeDisabled();
    await expect(increase).toHaveAttribute("disabled", "");

    // A second press during that window reaches nothing.
    await increase.click({ force: true, timeout: 2_000 }).catch(() => undefined);
    expect(patchCount).toBe(1);

    release?.();
    await expect(page.getByText(/saved version/)).toContainText("4");
    expect(patchCount).toBe(1);
  });
});

test.describe("login and cart merge", () => {
  test("an anonymous customer is asked to log in without losing the cart", async ({ page }) => {
    await installCartApi(page, { session: ANONYMOUS_SESSION });
    await page.goto("/cart");

    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("main", { name: "Log in" })).toBeVisible();
    await expect(page.getByText(/2 services are saved/i)).toBeVisible();
  });

  test("a merge conflict is decided per item, with no option preselected", async ({ page }) => {
    await installCartApi(page, {
      cartStatus: 409,
      cart: [
        envelope(
          "cart_merge_conflict",
          mergeConflictDetails([
            { kind: "EXACT_DUPLICATE", session_item_id: "s-1", customer_item_id: "c-1" },
            { kind: "DECISION_REQUIRED", session_item_id: "s-2", customer_item_id: "c-2" },
          ]),
        ),
        TWO_ITEM_CART,
      ],
    });
    await page.goto("/cart");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/duplicate request 1 of 2/i);
    await expect(dialog).toContainText(/duplicate request 2 of 2/i);

    for (const radio of await dialog.getByRole("radio").all()) {
      await expect(radio).not.toBeChecked();
    }
    await expect(dialog.getByRole("button", { name: /merge my bookings/i })).toBeDisabled();
  });

  test("resumes on the merged cart after every duplicate is decided", async ({ page }) => {
    const api = await installCartApi(page, {
      cartStatus: 409,
      cart: [
        envelope(
          "cart_merge_conflict",
          mergeConflictDetails([
            { kind: "EXACT_DUPLICATE", session_item_id: "s-1", customer_item_id: "c-1" },
          ]),
        ),
        TWO_ITEM_CART,
      ],
      merge: { body: TWO_ITEM_CART },
    });
    await page.goto("/cart");

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: /keep both/i }).check();
    await dialog.getByRole("button", { name: /merge my bookings/i }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Fan installation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Geyser repair" })).toBeVisible();

    const merge = api.to("/api/v1/cart/merge/");
    expect(merge).toHaveLength(1);
    expect(merge[0]?.body).toMatchObject({
      expected_customer_cart_version: 2,
      expected_session_cart_version: 5,
      decisions: [{ session_item_id: "s-1", action: "KEEP_BOTH" }],
    });
  });

  test("the merge dialog is fully keyboard-operable", async ({ page }) => {
    await installCartApi(page, {
      cartStatus: 409,
      cart: [
        envelope(
          "cart_merge_conflict",
          mergeConflictDetails([
            { kind: "EXACT_DUPLICATE", session_item_id: "s-1", customer_item_id: "c-1" },
          ]),
        ),
        TWO_ITEM_CART,
      ],
      merge: { body: TWO_ITEM_CART },
    });
    await page.goto("/cart");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Initial focus is inside the dialog: a keyboard user is not left on the
    // page behind it.
    const focusIsInsideDialog = await page.evaluate(() => {
      const element = document.querySelector("dialog[open]");
      return element instanceof HTMLElement && element.contains(document.activeElement);
    });
    expect(focusIsInsideDialog).toBe(true);

    // Focus cannot escape the modal. Tabbing far past the control count must
    // still land inside it — this is the property a hand-rolled overlay loses.
    for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => {
        const element = document.querySelector("dialog[open]");
        return element instanceof HTMLElement && element.contains(document.activeElement);
      }),
    ).toBe(true);

    // A choice can be made and sent without a pointer.
    await dialog.getByRole("radio", { name: /keep both/i }).focus();
    await page.keyboard.press("Space");
    await expect(dialog.getByRole("radio", { name: /keep both/i })).toBeChecked();
    await expect(dialog.getByRole("button", { name: /merge my bookings/i })).toBeEnabled();
  });

  test("Escape dismisses the merge dialog, because dismissing loses nothing", async ({
    page,
  }) => {
    await installCartApi(page, {
      cartStatus: 409,
      cart: [
        envelope(
          "cart_merge_conflict",
          mergeConflictDetails([{ kind: "EXACT_DUPLICATE", session_item_id: "s-1" }]),
        ),
        TWO_ITEM_CART,
      ],
    });
    await page.goto("/cart");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("a limit refusal explains itself instead of offering decisions that cannot resolve it", async ({
    page,
  }) => {
    await installCartApi(page, {
      cartStatus: 409,
      cart: [
        envelope(
          "cart_merge_conflict",
          mergeConflictDetails([
            { kind: "CART_LIMIT_EXCEEDED", combined_item_count: 12, maximum_item_count: 8 },
          ]),
        ),
        TWO_ITEM_CART,
      ],
    });
    await page.goto("/cart");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/too many services in one booking/i);
    await expect(dialog).toContainText(/12 services/);
    await expect(dialog).toContainText(/holds 8/);
    await expect(dialog.getByRole("radio")).toHaveCount(0);
  });
});

test.describe("route boundaries", () => {
  test("an unreadable cart offers a retry and does not claim anything was lost", async ({
    page,
  }) => {
    await installCartApi(page, {
      cartStatus: 409,
      cart: [envelope("cart_invalid"), TWO_ITEM_CART],
    });
    await page.goto("/cart");

    await expect(page.getByText(/could not load your booking/i)).toBeVisible();
    const retry = page.getByRole("button", { name: /try again/i });
    await expect(retry).toBeVisible();

    await retry.click();
    await expect(page.getByRole("heading", { name: "Fan installation" })).toBeVisible();
  });

  test("the empty cart says more than one service is allowed and blocks Continue", async ({
    page,
  }) => {
    await installCartApi(page, { cart: cart({ version: 1, items: [] }) });
    await page.goto("/cart");

    await expect(page.getByText(/nothing in your booking yet/i)).toBeVisible();
    await expect(page.getByText(/more than one/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});

test.describe("planning, pricing and confirming", () => {
  /**
   * Selects a `ChoiceCard` the way a person does — by pressing the card.
   *
   * The radio inside is `sr-only` so the focus ring can be drawn on the card, so
   * clicking the input directly is neither possible nor what a user does. The
   * label is the target; the input's `change` fires from it.
   */
  async function chooseCard(page: Page, label: RegExp) {
    await page.locator("label").filter({ hasText: label }).first().click();
  }

  /** Walks cart → address → start time → plan alternatives. */
  async function reachPlans(page: Page) {
    await page.goto("/cart");
    await page.getByRole("button", { name: "Continue" }).click();

    await chooseCard(page, /Jubilee Hills/i);
    // `server_now` is 3 Aug and the published window is 4 Aug, so the day the
    // adapter labels is "Tomorrow" — derived from the server clock, not the
    // browser's.
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    // 10:00Z rendered in the booking timezone (Asia/Kolkata).
    await chooseCard(page, /3:30 pm/);
    await page.getByRole("button", { name: /see how we can do this/i }).click();
  }

  test("renders every server structure — sequential, parallel, separate and mixed", async ({
    page,
  }) => {
    const api = await installCartApi(page, { addresses: [ADDRESS] });
    await reachPlans(page);

    // Each is the server's own `structure`, rendered as it ranked them. Nothing
    // here is inferred from the cart's contents.
    await expect(page.getByText("One professional, one visit", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Several professionals at the same time", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Separate visits", { exact: true })).toBeVisible();
    await expect(
      page.getByText("A mix of shared and separate visits", { exact: true }),
    ).toBeVisible();

    // The recommended one is separated but not hidden, and only it is preselected
    // — because the server marked it.
    await expect(page.getByText("Recommended")).toBeVisible();
    await expect(page.getByText("Other options")).toBeVisible();

    // Separate visits genuinely show two different days, from the server's own
    // per-unit windows.
    await expect(page.getByText(/Wed, 5 Aug|5 Aug/).first()).toBeVisible();

    const planCall = api.to("/api/v1/fulfilment-plan-sets/")[0];
    expect(planCall?.body).toMatchObject({
      address_id: "addr-1",
      expected_cart_version: 3,
      preferred_start: PREFERRED_START,
    });
  });

  test("prices the selected plan and confirms it, rendering only server amounts", async ({
    page,
  }) => {
    const api = await installCartApi(page, { addresses: [ADDRESS] });
    await reachPlans(page);

    await page.getByRole("button", { name: /continue with this option/i }).click();

    // Review: the quote's own units, lines and total.
    await expect(page.getByRole("heading", { name: /review your booking/i })).toBeVisible();
    await expect(page.getByText("₹317.42").first()).toBeVisible();
    await expect(page.getByText(/this visit's share of the one platform fee/i)).toBeVisible();
    await expect(page.getByText(/confirmed together/i)).toBeVisible();

    await page.getByRole("button", { name: /confirm this booking/i }).click();

    await expect(page.getByRole("heading", { name: /your booking is confirmed/i })).toBeVisible();
    await expect(page.getByText(/have not been charged/i)).toBeVisible();
    // 1.9.0 publishes group reads, so the copy must not claim tracking is
    // impossible — only that this screen does not watch it yet.
    await expect(page.getByText(/carries on without this page open/i)).toBeVisible();
    await expect(page.getByText(/not available yet/i)).toHaveCount(0);

    const quoteCall = api.to("/api/v1/plan-quotes/")[0];
    expect(quoteCall?.body).toEqual({ plan_id: "plan-sequential" });
    expect(api.to("/api/v1/checkouts/")[0]?.body).toEqual({ quote_id: "quote-1" });
  });

  test("confirms under one stable idempotency key, so a repeat is the same booking", async ({
    page,
  }) => {
    const api = await installCartApi(page, {
      addresses: [ADDRESS],
      // The second attempt is Django replaying the first result under the same
      // key — one intent, one Booking Group.
      checkout: [{ body: checkout() }, { body: checkout() }],
    });
    await reachPlans(page);
    await page.getByRole("button", { name: /continue with this option/i }).click();
    await page.getByRole("button", { name: /confirm this booking/i }).click();
    await expect(page.getByRole("heading", { name: /your booking is confirmed/i })).toBeVisible();

    const keys = api
      .to("/api/v1/checkouts/")
      .map((call) => call.headers?.["idempotency-key"])
      .filter(Boolean);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(1);
  });

  test("a duplicate confirmation still in flight is told to wait, never to send again", async ({
    page,
  }) => {
    await installCartApi(page, {
      addresses: [ADDRESS],
      checkout: [{ status: 409, body: envelope("idempotency_in_progress") }],
    });
    await reachPlans(page);
    await page.getByRole("button", { name: /continue with this option/i }).click();
    await page.getByRole("button", { name: /confirm this booking/i }).click();

    // Scoped past Next's own route announcer, which also carries `role="alert"`.
    const alert = page.locator("p[role='alert']");
    await expect(alert).toContainText(/wait a moment/i);
    await expect(alert).toContainText(/rather than confirming again/i);
    // No success is claimed, and nothing pretends a booking exists.
    await expect(page.getByRole("heading", { name: /your booking is confirmed/i })).toHaveCount(0);
  });

  test("an expired quote is shown as a lapsed price, and cannot be confirmed at all", async ({
    page,
  }) => {
    await installCartApi(page, {
      addresses: [ADDRESS],
      quote: { body: groupQuote() },
      // The quote is created ACTIVE and re-read as EXPIRED. Holding the id and
      // re-reading it — rather than copying the response into React state — is
      // what lets the screen catch this *before* the customer presses Confirm.
      quoteRead: { body: groupQuote({ status: "EXPIRED" }) },
    });
    await reachPlans(page);
    await page.getByRole("button", { name: /continue with this option/i }).click();

    await expect(page.getByText(/this price has expired/i)).toBeVisible();
    await expect(page.getByText(/nothing has been booked or charged/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /go back to my booking/i })).toBeVisible();
    // The confirm action is gone, not merely disabled: there is nothing to
    // confirm.
    await expect(page.getByRole("button", { name: /confirm this booking/i })).toHaveCount(0);
  });

  test("a quote refused at confirmation is re-read rather than retried", async ({ page }) => {
    await installCartApi(page, {
      addresses: [ADDRESS],
      checkout: [{ status: 409, body: envelope("quote_expired") }],
    });
    await reachPlans(page);
    await page.getByRole("button", { name: /continue with this option/i }).click();
    await page.getByRole("button", { name: /confirm this booking/i }).click();

    await expect(page.locator("p[role='alert']")).toContainText(
      /expired before it was confirmed/i,
    );
    await expect(page.getByRole("heading", { name: /your booking is confirmed/i })).toHaveCount(0);
  });

  test("a withdrawn plan set cannot be priced and offers a re-plan", async ({ page }) => {
    await installCartApi(page, {
      addresses: [ADDRESS],
      planSet: { body: planSet() },
      // Created ACTIVE, re-read as INVALIDATED: the customer changed nothing,
      // the server's answer did.
      planSetRead: { body: planSet({ status: "INVALIDATED" }) },
    });
    await reachPlans(page);

    await expect(page.getByText(/no longer current/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /work out fresh options/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue with this option/i }),
    ).toHaveCount(0);
  });

  test("a plan the server could not build explains which item, per item", async ({ page }) => {
    await installCartApi(page, {
      addresses: [ADDRESS],
      planSet: {
        status: 409,
        body: envelope("fulfilment_plan_unavailable", {
          item_failures: [
            { cart_item_id: "item-2", reason: "no_eligible_capacity" },
          ],
        }),
      },
    });
    await reachPlans(page);

    await expect(page.getByText(/could not arrange this booking/i)).toBeVisible();
    await expect(page.getByText("Geyser repair")).toBeVisible();
    await expect(page.getByText(/no professional is available/i)).toBeVisible();
    await expect(page.getByText(/nothing has been booked or charged/i).first()).toBeVisible();
  });
});

/**
 * The shared responsive/accessibility matrix, now that `/cart` renders without a
 * live backend. It asserts one `main`, one `h1`, no horizontal overflow at four
 * widths plus 200% zoom, a visible focus indicator and no infinite animation
 * under reduced motion.
 */
test.describe("cart responsiveness", () => {
  test.beforeEach(async ({ page }) => {
    await installCartApi(page);
  });

  verifyResponsiveAccessibility("customer", [
    {
      path: "/cart",
      ready: async (page) => {
        await expect(page.getByRole("heading", { level: 1, name: "Your booking" })).toBeVisible();
      },
    },
  ]);
});
