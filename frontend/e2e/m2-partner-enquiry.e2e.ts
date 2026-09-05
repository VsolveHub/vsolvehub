import { expect, test, type Page, type Route } from "@playwright/test";

import {
  APPROVED_APPLICATION,
  AUTHENTICATED_PARTNER,
  installDispatchApi,
} from "./support/dispatch-api";

/**
 * The Partner enquiry inbox and the two quote composers, in a browser.
 *
 * Wave B2 (`M2-FE-301`..`M2-FE-313`). This suite exists for the same reason
 * `apply.e2e.ts` does: the failures worth catching here are ones no unit test
 * and no type check can see.
 *
 *  - A route file that became a Client Component loses `export const dynamic`
 *    and `metadata` silently, and its page is prerendered as static, indexable
 *    HTML. Wave B1 shipped that bug and the build output is where it showed.
 *  - `WorkspaceRoute` takes a render function, which cannot cross the
 *    server-to-client boundary. A route that passed one throws on navigation and
 *    compiles cleanly.
 *  - A tab the registry offers and no route serves 404s inside a Partner's own
 *    workspace.
 *
 * Every M2 route below is stubbed here rather than in `support/dispatch-api.ts`.
 * That file is shared with the A1 suites and adding M2 shapes to it would make
 * an offer-inbox spec depend on the enquiry contract.
 */

const API = "**/api/v1";

const WORKFORCE_GRANT = {
  workspace_key: "A3_TIME_BLOCK",
  commercial_mode: "LEAD_ONLY",
  actions: ["enquiry.view", "enquiry.respond", "proposal.submit"],
};

const PROJECT_GRANT = {
  workspace_key: "A5_CUSTOM_PROJECT",
  commercial_mode: "MANAGED_PAYMENT_REQUIRED",
  actions: ["enquiry.view", "enquiry.respond", "proposal.submit"],
};

function enquirySummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    requirement_id: "22222222-2222-4222-8222-222222222222",
    category_slug: "housekeeping-staff",
    archetype: "A3_TIME_BLOCK",
    status: "INVITED",
    wave: 1,
    requested_start: "2026-08-20T03:30:00Z",
    service_by: "2026-08-25",
    language: "en-IN",
    responds_by: "2026-08-30T09:00:00Z",
    created_at: "2026-08-12T06:00:00Z",
    ...overrides,
  };
}

function enquiryDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...enquirySummary(),
    answers: { worker_count: 6, duration_days: 4 },
    additional_details: "Two floors, deep clean before a handover.",
    budget_min_paise: null,
    budget_max_paise: 4_000_000,
    decline_reason_code: "",
    questions: [],
    site_visits: [],
    ...overrides,
  };
}

interface EnquiryApiOptions {
  readonly grants?: unknown[];
  /** The list body. Defaults to the DRF page envelope Django actually sends. */
  readonly listBody?: unknown;
  readonly detail?: unknown;
  readonly proposalStatus?: number;
  readonly proposalBody?: unknown;
}

/**
 * Stubs the six M2 routes this suite touches, after `installDispatchApi`.
 *
 * Order matters: `installDispatchApi` registers a catch-all 404 first, and
 * Playwright gives precedence to the route registered last. These therefore go
 * in afterwards and win.
 */
async function installEnquiryApi(page: Page, options: EnquiryApiOptions = {}) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": route.request().headers().origin ?? "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "content-type,x-csrftoken,idempotency-key",
        "Access-Control-Expose-Headers": "Date",
      },
      body: JSON.stringify(body),
    });

  await page.route(`${API}/partner/workspaces/`, (route) =>
    json(route, { workspaces: options.grants ?? [WORKFORCE_GRANT] }),
  );

  await page.route(
    (url) => /\/api\/v1\/partner\/enquiries\/?$/.test(url.pathname),
    (route) =>
      json(
        route,
        options.listBody ?? { next: null, previous: null, results: [enquirySummary()] },
      ),
  );

  await page.route(
    (url) => /\/api\/v1\/partner\/enquiries\/[^/]+\/$/.test(url.pathname),
    (route) => json(route, options.detail ?? enquiryDetail()),
  );

  await page.route(`${API}/proposals/`, (route) =>
    json(
      route,
      options.proposalBody ?? { code: "m2_proposal_invalid_shape", message: "Not expected." },
      options.proposalStatus ?? 400,
    ),
  );
}

async function signedInPartner(page: Page, options: EnquiryApiOptions = {}) {
  await installDispatchApi(page, {
    session: AUTHENTICATED_PARTNER,
    application: APPROVED_APPLICATION,
  });
  await installEnquiryApi(page, options);
}

/** Collects everything React or the browser complained about. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("the enquiry inbox", () => {
  test("an approved workforce Partner reaches a real enquiry by clicking", async ({ page }) => {
    const errors = watchConsole(page);
    await signedInPartner(page);

    await page.goto("/workforce");
    await page.getByRole("link", { name: /enquiries/i }).first().click();

    await expect(page).toHaveURL(/\/workforce\/enquiries$/);
    await expect(page.getByRole("heading", { name: /waiting for you/i })).toBeVisible();

    await page.getByRole("link", { name: /housekeeping staff/i }).click();
    await expect(page.getByText(/What the customer asked for/i)).toBeVisible();

    expect(errors, `Console errors on the enquiry journey: ${errors.join(" | ")}`).toEqual([]);
  });

  test("reads Django's page envelope, not the bare array the contract declares", async ({
    page,
  }) => {
    // `m2_partner_enquiry_list` is declared as `EnquirySummary[]`; the view
    // returns a cursor page. Code written against the declared type throws.
    await signedInPartner(page, {
      listBody: { next: null, previous: null, results: [enquirySummary()] },
    });

    await page.goto("/workforce/enquiries");
    await expect(page.getByRole("link", { name: /housekeeping staff/i })).toBeVisible();
  });

  test("says so when the server is holding pages this build cannot ask for", async ({ page }) => {
    // The endpoint publishes no `cursor` parameter, so page two is unreachable.
    // A truncated inbox that looks complete is the failure being prevented.
    await signedInPartner(page, {
      listBody: {
        next: "http://localhost/api/v1/partner/enquiries/?cursor=cD0y",
        previous: null,
        results: [enquirySummary()],
      },
    });

    await page.goto("/workforce/enquiries");
    await expect(page.getByText(/holding older enquiries/i)).toBeVisible();
  });

  test("a project workspace does not show workforce enquiries", async ({ page }) => {
    await signedInPartner(page, { grants: [WORKFORCE_GRANT, PROJECT_GRANT] });

    await page.goto("/projects/enquiries");
    await expect(page.getByText(/No enquiries yet/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /housekeeping staff/i })).toHaveCount(0);
  });

  test("a Partner without the capability is not shown the workspace", async ({ page }) => {
    // Suspension is expressed by omitting the workspace. `WorkspaceRoute` fails
    // closed and never falls back to `/jobs`.
    await signedInPartner(page, { grants: [] });

    await page.goto("/workforce/enquiries");
    await expect(page.getByRole("link", { name: /housekeeping staff/i })).toHaveCount(0);
  });
});

test.describe("responding", () => {
  test("accepting states the capacity hold before it is taken", async ({ page }) => {
    await signedInPartner(page);

    await page.goto("/workforce/enquiries/11111111-1111-4111-8111-111111111111");
    await page.getByRole("button", { name: /^Accept$/ }).click();

    await expect(page.getByText(/You are not committing to a price yet/i)).toBeVisible();
    await expect(page.getByText(/holds your availability for 4 days/i).first()).toBeVisible();
  });

  test("declining asks for a reason and says what it is used for", async ({ page }) => {
    await signedInPartner(page);

    await page.goto("/workforce/enquiries/11111111-1111-4111-8111-111111111111");
    await page.getByRole("button", { name: /^Decline$/ }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByLabel(/Why are you turning this down\?/i)
      .selectOption("no_capacity");
    await expect(page.getByText(/We stop offering you work on these dates/i)).toBeVisible();
  });

  test("no customer contact appears at any point", async ({ page }) => {
    await signedInPartner(page, { detail: enquiryDetail({ status: "ACCEPTED" }) });

    await page.goto("/workforce/enquiries/11111111-1111-4111-8111-111111111111");
    await expect(page.getByText(/What the customer asked for/i)).toBeVisible();

    const body = (await page.locator("body").textContent()) ?? "";
    expect(body, "A customer phone number reached the Partner surface").not.toMatch(
      /\+91|\b[6-9]\d{9}\b/,
    );
  });
});

/**
 * This replaced three A3-composer specs and one A5-composer spec.
 *
 * They drove `/workforce/enquiries/…` and `/projects/enquiries/…` and filled
 * labels like "Rate per worker per day", "Minimum days" and "Stage 1 name".
 * Those screens no longer exist: both paths 308-redirect to
 * `/work/enquiries/:id`, which mounts `enquiry-detail-screen.tsx` — a screen
 * with no composer on it at all.
 *
 * So the specs could not pass, by construction, and had not been able to for
 * some time. A suite with permanently red specs in it stops being read, which
 * is worse than having no spec at all: the next real regression arrives in a
 * file everyone has learned to scroll past.
 *
 * They are replaced rather than deleted because the absence is itself a
 * promise worth pinning — the app says plainly that it cannot take this quote,
 * instead of showing a form that does nothing. When FE-6 mounts the item-wise
 * and labour-wise composer, this describe is what gets rewritten again.
 */
test.describe("the quote form that is not there yet", () => {
  test("says so plainly rather than showing a form that does nothing", async ({ page }) => {
    await signedInPartner(page, { detail: enquiryDetail({ status: "ACCEPTED" }) });

    await page.goto("/workforce/enquiries/11111111-1111-4111-8111-111111111111");

    await expect(page.getByText(/No quote form for this yet/i)).toBeVisible();
    // The honest part: it names the way out rather than leaving a dead end.
    await expect(page.getByText(/Support can take your quote over the phone/i)).toBeVisible();

    // And it is genuinely absent, not merely hidden behind a scroll.
    await expect(page.getByLabel(/Rate per worker per day/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Send quote/i })).toHaveCount(0);
  });

  test("keeps the old workforce path working as a redirect", async ({ page }) => {
    // The composer went; the URL did not. A partner with the old link bookmarked
    // still lands somewhere real.
    await signedInPartner(page, { detail: enquiryDetail({ status: "ACCEPTED" }) });

    await page.goto("/workforce/enquiries/11111111-1111-4111-8111-111111111111");

    await expect(page).toHaveURL(/\/work\/enquiries\//);
  });
});

test.describe("what the routes promise", () => {
  test("no enquiry route is indexable", async ({ page }) => {
    // Every authenticated Partner route is `force-dynamic` + `robots: noindex`.
    // A route file that became a Client Component loses both silently.
    await signedInPartner(page);

    for (const path of [
      "/workforce/enquiries",
      "/projects/enquiries",
      "/workforce/enquiries/11111111-1111-4111-8111-111111111111",
    ]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
    }
  });
});
