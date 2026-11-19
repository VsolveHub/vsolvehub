import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Careers (A10) end-to-end across all three portals, against the real Django API.
 *
 * This is the Careers counterpart to `django.e2e.ts`: it drives the actual
 * backend rather than contract-shaped route stubs, because the things worth
 * proving here cannot be stubbed — moderation is a server state machine, the
 * "one active application per listing" rule is a server guard, and contact
 * reveal is a server-side write. A stubbed version would pass while the real
 * flow was broken.
 *
 * ## Why one test and not seventeen
 *
 * The flow crosses three identities and the state it asserts on is created by
 * the previous step: the employer posts a role, Operations approves it, the
 * employer publishes it, an applicant applies, the employer works that lead.
 * Split across parallel tests, each would need its own fixture and the trace
 * would show fragments rather than the run. One test means one trace that
 * replays the whole story start to finish.
 *
 * ## Prerequisites
 *
 *   backend on :8000 with the local seeds applied
 *   customer :3000, partner :3001, operations :3002 running
 *   `python manage.py make_a10_demo_sessions` to mint the three sessions
 *
 * Sessions are minted rather than logged-in-per-run on purpose: the OTP guard
 * allows five codes per phone per ten minutes, so a login-based spec would go
 * red on the second run for a reason that has nothing to do with Careers.
 *
 * ## It skips instead of failing when the stack is absent
 *
 * Same reasoning as `django.e2e.ts`: the rest of the suite must stay runnable
 * with no backend, and a red suite that people learn to re-run is worse than an
 * honest skip.
 */

const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const CUSTOMER_ORIGIN = "http://localhost:3000";
const PARTNER_ORIGIN = "http://localhost:3001";
const OPERATIONS_ORIGIN = "http://localhost:3002";

const AUTH_DIR = resolve(process.cwd(), "e2e", ".auth");
const stateFile = (role: string) => resolve(AUTH_DIR, `a10-${role}.json`);

/**
 * `A10_VIDEO=1` records one video per portal.
 *
 * It has to be passed to `newContext` explicitly: `use.video` in the config only
 * covers Playwright's own `page` fixture, and this spec opens three contexts by
 * hand so each role keeps its own session.
 */
const RECORD_VIDEO = process.env.A10_VIDEO === "1";
const VIDEO_DIR = resolve(process.cwd(), "test-results", "a10-videos");

/**
 * One folder per portal: Playwright names video files `page@<hash>.webm`, so
 * without a folder each the three recordings are indistinguishable.
 */
function videoOptionsFor(label: string) {
  return RECORD_VIDEO
    ? { recordVideo: { dir: resolve(VIDEO_DIR, label), size: { width: 1280, height: 800 } } }
    : {};
}

async function backendIsReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/health/ready/`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Keep the evidence in the report and in the trace, not only in the assertion. */
async function capture(page: Page, testInfo: { attach: Function }, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test.describe("Careers (A10) — employer posts, Operations approves, applicant applies", () => {
  test.beforeEach(async () => {
    test.skip(!(await backendIsReachable()), `Django is not reachable at ${API_ORIGIN}`);
    test.skip(
      !existsSync(stateFile("customer")) ||
        !existsSync(stateFile("partner")) ||
        !existsSync(stateFile("operations")),
      "Missing minted sessions — run: cd backend && .venv/bin/python manage.py make_a10_demo_sessions",
    );
  });

  test("the whole listing lifecycle, across three portals", async ({ browser }, testInfo) => {
    // A slow-motion recording run multiplies wall-clock time by the pause after
    // every action, so it needs far more headroom than an ordinary run.
    const slowMo = Number(process.env.A10_SLOW_MO ?? 0);
    test.setTimeout(slowMo > 0 ? 900_000 : 240_000);

    // Unique per run so a previous run's role can never satisfy this one.
    const title = `A10 E2E Role ${Date.now().toString().slice(-6)}`;
    const description =
      "Automated end-to-end check of the Careers listing lifecycle. Safe to delete.";
    const location = "Hyderabad, Telangana";

    const partnerContext = await browser.newContext({
      storageState: stateFile("partner"),
      baseURL: PARTNER_ORIGIN,
      ...videoOptionsFor("01-employer"),
    });
    const operationsContext = await browser.newContext({
      storageState: stateFile("operations"),
      baseURL: OPERATIONS_ORIGIN,
      ...videoOptionsFor("02-operations"),
    });
    const customerContext = await browser.newContext({
      storageState: stateFile("customer"),
      baseURL: CUSTOMER_ORIGIN,
      ...videoOptionsFor("03-applicant"),
    });

    const employer = await partnerContext.newPage();
    const operations = await operationsContext.newPage();
    const applicant = await customerContext.newPage();

    try {
      // ---- 1. The employer creates the role ----------------------------------
      await employer.goto("/listings");
      await expect(employer.getByRole("button", { name: "Post New Opening" })).toBeVisible();

      await employer.getByRole("button", { name: "Post New Opening" }).click();
      const modal = employer.locator("form").filter({ hasText: "Job Title" });
      await expect(modal).toBeVisible();

      // The role drives the variant, and Preview stays disabled until one is
      // chosen — so this has to happen before anything else in the form.
      await modal.getByRole("combobox").first().selectOption({ label: "App Developers" });

      // A too-short title is refused in the form before any request is made.
      await modal.getByPlaceholder("e.g. Senior Python / React Developer").fill("abc");
      await modal
        .getByPlaceholder("Describe key responsibilities, qualifications, requirements, and shift timings...")
        .fill(description);
      await modal.getByPlaceholder("e.g. Indiranagar, Bengaluru / Remote").fill(location);
      // The field renders a fixed +91 chip, so the value is national digits only.
      await modal.getByLabel("Contact phone").fill("9900000088");
      await modal.getByRole("button", { name: "Preview" }).click();
      await expect(employer.getByText("Job title must be at least 5 characters.")).toBeVisible();
      await capture(employer, testInfo, "01-employer-create-validation");

      await modal.getByPlaceholder("e.g. Senior Python / React Developer").fill(title);
      await modal.getByLabel("Minimum pay").fill("25000");
      await modal.getByLabel("Maximum pay").fill("40000");
      await modal.getByLabel("Pay period").selectOption({ label: "Monthly" });
      await modal.getByRole("button", { name: "Preview" }).click();
      await employer.getByRole("button", { name: "Save Changes" }).click();

      await expect(employer.getByRole("heading", { name: title })).toBeVisible();
      await capture(employer, testInfo, "02-employer-draft-created");

      // ---- 2. Submit for moderation ------------------------------------------
      // The newest draft sorts first in this list, so the first matching control
      // belongs to the role just created. Scoping by an ancestor `div` instead
      // resolved to a container that never contained the button.
      await expect(employer.getByRole("heading", { name: title })).toBeVisible();
      await employer.getByRole("button", { name: "Submit for Review" }).first().click();
      await expect(employer.getByText("In Review").first()).toBeVisible();
      await capture(employer, testInfo, "03-employer-submitted");

      // ---- 3. Operations moderates it ----------------------------------------
      await operations.goto("/operations/listings");
      await operations.getByRole("button", { name: /Pending Review/ }).click();

      // The Operations console renders one table per tab, so the title matches a
      // row in several of them. Bind to the row that also carries the decision
      // control rather than to whichever one happens to be first.
      const row = operations
        .getByRole("row", { hasText: title })
        .filter({ has: operations.getByRole("button", { name: "Review & Decide" }) })
        .first();
      await expect(row).toBeVisible();
      await capture(operations, testInfo, "04-operations-queue");

      await row.getByRole("button", { name: "Review & Decide" }).click();
      await operations
        .getByPlaceholder("e.g. Verified standard job posting")
        .fill("Verified employer and complete role details. Approved.");
      await capture(operations, testInfo, "05-operations-decision");
      await operations.getByRole("button", { name: "Confirm Approval" }).click();

      // Approved is not published: the decision modal must close and the posting
      // must still be absent from the public board until the employer publishes
      // it. The publish step below can only succeed on an approved posting, so
      // that is what proves approval actually landed.
      await expect(operations.getByRole("button", { name: "Confirm Approval" })).toHaveCount(0);
      const publicAfterApproval = await fetch(`${API_ORIGIN}/api/v1/listings`).then((r) => r.json());
      expect(JSON.stringify(publicAfterApproval)).not.toContain(title);
      await capture(operations, testInfo, "06-operations-approved");

      // ---- 4. The employer publishes it --------------------------------------
      await employer.reload();
      await expect(employer.getByRole("heading", { name: title })).toBeVisible();
      await employer.getByRole("button", { name: "Publish Live" }).first().click();
      await expect(employer.getByRole("button", { name: "Publish Live" })).toHaveCount(0);
      await capture(employer, testInfo, "07-employer-published");

      // Now it must be public.
      const publicAfterPublish = await fetch(`${API_ORIGIN}/api/v1/listings`).then((r) => r.json());
      expect(JSON.stringify(publicAfterPublish)).toContain(title);

      // ---- 5. A second applicant sees the already-applied guard --------------
      await applicant.goto("/listings");
      await expect(applicant.getByText(title).first()).toBeVisible();
      await capture(applicant, testInfo, "08-public-browse");

      // ---- 5b. Typing must not query the server ------------------------------
      // This is the client's loudest technical complaint. Before the fix the
      // query key held the raw input, so "software developer" was 18 requests.
      // Nothing else in the suite looks at the keyword box, so without this the
      // behaviour can come back unnoticed.
      const browseRequests: string[] = [];
      applicant.on("request", (request) => {
        if (request.url().includes("/api/v1/listings?")) browseRequests.push(request.url());
      });

      const keyword = applicant.getByPlaceholder("Job title, keyword, skill, or employer...");
      await keyword.click();
      // 350ms between keys clears the 300ms threshold in the acceptance criteria,
      // so a re-introduced debounce-only fix still fails this assertion.
      await keyword.type("software developer", { delay: 350 });
      await applicant.waitForTimeout(800);
      expect(browseRequests, "typing must not reach the API").toHaveLength(0);

      const committed = applicant.waitForResponse((r) => r.url().includes("/api/v1/listings?"));
      await applicant.getByRole("button", { name: "Search", exact: true }).first().click();
      await committed;
      expect(browseRequests, "Search must commit exactly one request").toHaveLength(1);
      await capture(applicant, testInfo, "08b-search-commits-on-submit");

      // Reset so the apply flow below still finds the listing.
      await applicant.getByRole("button", { name: "Clear all filters" }).click();
      await expect(applicant.getByText(title).first()).toBeVisible();

      // ---- 6. The applicant applies ------------------------------------------
      await applicant.getByText(title).first().click();
      await expect(applicant.getByText("Apply for this Position")).toBeVisible();
      await applicant.getByPlaceholder("e.g. sarah@example.com").fill("a10-e2e@example.com");
      await applicant.getByPlaceholder("e.g. 4 years in Frontend React / Python").fill("5 years");
      await applicant
        .getByPlaceholder("Briefly introduce yourself and your availability...")
        .fill("Automated end-to-end application.");
      await capture(applicant, testInfo, "09-apply-form-filled");

      await applicant.getByRole("button", { name: "Submit Application" }).click();
      await expect(applicant.getByText("Application Submitted!")).toBeVisible();
      await capture(applicant, testInfo, "10-application-submitted");

      // Re-opening the listing must now show the status card, not the form.
      await applicant.reload();
      await expect(applicant.getByText("You have already applied")).toBeVisible();
      await expect(applicant.getByRole("button", { name: "Submit Application" })).toHaveCount(0);
      await capture(applicant, testInfo, "11-already-applied-card");

      await applicant.goto("/listings/my-applications");
      await expect(applicant.getByText(title).first()).toBeVisible();
      await capture(applicant, testInfo, "12-my-applications");

      // ---- 7. The employer works the lead ------------------------------------
      // Reach the lead inbox by id. The card's control differs by status
      // ("Submit for Review" / "Publish Live" / leads), so resolving the id from
      // the public feed is the stable route rather than guessing a button name.
      const rowsAfterPublish = Array.isArray(publicAfterPublish)
        ? publicAfterPublish
        : publicAfterPublish.results;
      const published = rowsAfterPublish.find((row: { title: string }) => row.title === title);
      expect(published, "the published role must be resolvable from the public feed").toBeTruthy();

      await employer.goto(`/listings/${published.id}`);
      await expect(
        employer.getByRole("button", { name: "Shortlist", exact: true }).first(),
      ).toBeVisible();
      await capture(employer, testInfo, "13-employer-leads");

      // `exact` matters: the default substring match makes "Shortlist" collide
      // with the "Shortlisted" filter tab, and clicking the tab silently skips
      // the shortlisting while still looking like it worked.
      await employer.getByRole("button", { name: "Shortlist", exact: true }).first().click();
      await capture(employer, testInfo, "14-employer-shortlisted");

      // Shortlisting moves the card into the "Shortlisted" tab, so follow it
      // there before reaching for the reveal control.
      await employer.getByRole("button", { name: "Shortlisted", exact: true }).first().click();
      await employer.getByRole("button", { name: "Reveal Contact", exact: true }).first().click();

      // Revealing moves it again — to "Contacted". Read the number there, which
      // is the only place it is actually rendered.
      await employer.getByRole("button", { name: "Contacted", exact: true }).first().click();
      await expect(employer.getByText("+919900000077").first()).toBeVisible();
      await capture(employer, testInfo, "15-employer-contact-revealed");
    } finally {
      // Closing must never mask the real failure: a teardown error here would
      // otherwise replace the assertion that actually failed.
      for (const context of [partnerContext, operationsContext, customerContext]) {
        await context.close().catch(() => undefined);
      }
    }
  });
});
