import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Careers (A10) end-to-end, against the real Django API: a job goes live, a job seeker applies,
 * the employer works the applicant through to Hired and closes the job as filled, and the job
 * seeker sees that they were hired.
 *
 * It drives the actual backend rather than route stubs, because what it proves cannot be stubbed:
 * the stage moves are a server state machine (contract 1.102.0), "one active application per
 * job" is a server guard, contact reveal is a server write, and "close as filled" turns everyone
 * else down on the server.
 *
 * ## The job is posted through the API, not the wizard
 *
 * Partners publish instantly (no review queue since the quick-post flow), and the 4-step post
 * wizard has its own component tests. Posting through `POST /partner/jobs` keeps this run about
 * the hiring journey, and a wording change in the wizard cannot turn it red.
 *
 * ## One test, not many
 *
 * The flow crosses two identities and each step asserts on state the previous one created, so
 * one test gives one trace that replays the whole story.
 *
 * ## Prerequisites
 *
 *   backend on :8000 with the local seeds applied (`seed_listing_catalog`)
 *   customer :3000 and partner :3001 running
 *   `python manage.py make_a10_demo_sessions` to mint the sessions
 *
 * Sessions are minted rather than logged in per run: the OTP guard allows five codes per phone
 * per ten minutes, so a login-based spec would fail on the second run for reasons unrelated to
 * Careers. It skips, rather than fails, when the stack is not running.
 */

const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const CUSTOMER_ORIGIN = "http://localhost:3000";
const PARTNER_ORIGIN = "http://localhost:3001";
/** The demo job seeker minted by `make_a10_demo_sessions`. */
const APPLICANT_PHONE = "+919900000077";

const AUTH_DIR = resolve(process.cwd(), "e2e", ".auth");
const stateFile = (role: string) => resolve(AUTH_DIR, `a10-${role}.json`);

/** `A10_VIDEO=1` records one video per portal (contexts are opened by hand, one per role). */
const RECORD_VIDEO = process.env.A10_VIDEO === "1";
const VIDEO_DIR = resolve(process.cwd(), "test-results", "a10-videos");

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

/** Post and publish a job as the signed-in employer, with the session's own CSRF token. */
async function postJob(context: BrowserContext, title: string): Promise<{ id: string }> {
  const { cookies } = await context.storageState();
  const csrf = cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  const response = await context.request.post(`${API_ORIGIN}/api/v1/partner/jobs`, {
    headers: { "X-CSRFToken": csrf, Referer: `${PARTNER_ORIGIN}/listings/post`, Origin: PARTNER_ORIGIN },
    // The basics the server needs to publish (title, city, job type, salary). One vacancy, so a
    // single hire offers "Close job as filled".
    data: {
      title,
      vacancies: 1,
      city: "Hyderabad",
      job_type: "FULL_TIME",
      salary_min_paise: 2_000_000,
      salary_max_paise: 2_500_000,
      salary_period: "MONTHLY",
      publish: true,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string };
}

async function publicTitles(): Promise<string> {
  return JSON.stringify(await fetch(`${API_ORIGIN}/api/v1/listings`).then((r) => r.json()));
}

test.describe("Careers (A10): job seeker applies, employer hires and closes the job as filled", () => {
  test.beforeEach(async () => {
    test.skip(!(await backendIsReachable()), `Django is not reachable at ${API_ORIGIN}`);
    test.skip(
      !existsSync(stateFile("customer")) || !existsSync(stateFile("partner")),
      "Missing minted sessions — run: cd backend && .venv/bin/python manage.py make_a10_demo_sessions",
    );
  });

  test("from a live job to Hired, across both portals", async ({ browser }, testInfo) => {
    const slowMo = Number(process.env.A10_SLOW_MO ?? 0);
    test.setTimeout(slowMo > 0 ? 900_000 : 240_000);

    // Unique per run so a previous run's job can never satisfy this one.
    const title = `A10 E2E Role ${Date.now().toString().slice(-6)}`;

    const partnerContext = await browser.newContext({
      storageState: stateFile("partner"),
      baseURL: PARTNER_ORIGIN,
      ...videoOptionsFor("01-employer"),
    });
    const customerContext = await browser.newContext({
      storageState: stateFile("customer"),
      baseURL: CUSTOMER_ORIGIN,
      ...videoOptionsFor("02-applicant"),
    });
    const employer = await partnerContext.newPage();
    const applicant = await customerContext.newPage();

    try {
      // ---- 1. The job goes live at once ----------------------------------------
      const job = await postJob(partnerContext, title);
      expect(await publicTitles()).toContain(title);

      // ---- 2. Typing in search must not query the server -----------------------
      // Before the fix the query key held the raw input, so "software developer" was 18 requests.
      await applicant.goto("/listings");
      // Let the page's own first load finish, so only requests caused by typing are counted.
      await applicant.waitForLoadState("networkidle");
      const browseRequests: string[] = [];
      applicant.on("request", (request) => {
        if (request.url().includes("/api/v1/listings?")) browseRequests.push(request.url());
      });
      const keyword = applicant.getByPlaceholder("Job title or skill — Tally, Nurse, Full Stack");
      await keyword.click();
      // 350ms between keys clears a 300ms debounce, so a debounce-only fix still fails here.
      await keyword.type("software developer", { delay: 350 });
      await applicant.waitForTimeout(800);
      expect(browseRequests, "typing must not reach the API").toHaveLength(0);
      const committed = applicant.waitForResponse((r) => r.url().includes("/api/v1/listings?"));
      await applicant.getByRole("button", { name: "Search jobs", exact: true }).first().click();
      await committed;
      expect(browseRequests, "Search must commit exactly one request").toHaveLength(1);
      // Back to the unfiltered board for the apply flow.
      await applicant.goto("/listings");

      // ---- 3. The job seeker applies -------------------------------------------
      await expect(applicant.getByText(title).first()).toBeVisible();
      await applicant.getByRole("link", { name: `View ${title} details` }).click();
      // The two-step form (the demo seeker has no job profile, so no Quick apply).
      await expect(applicant.getByText("Apply for this Position")).toBeVisible();
      await applicant.getByLabel("Full name").fill("A10 E2E Applicant");
      await applicant.getByLabel("Email").fill("a10-e2e@example.com");
      await applicant.getByPlaceholder("e.g. 2 years, or Fresher").fill("5 years");
      await applicant.getByRole("button", { name: "Review Application" }).click();
      await applicant.getByRole("button", { name: "Submit application" }).click();
      await expect(applicant.getByText("Application Submitted!")).toBeVisible();
      await capture(applicant, testInfo, "01-application-submitted");

      // One active application per job: re-opening shows the status card, not the form.
      await applicant.reload();
      await expect(applicant.getByText("You have already applied")).toBeVisible();
      await expect(applicant.getByRole("button", { name: "Submit application" })).toHaveCount(0);

      // ---- 4. The employer works the applicant through to Hired -----------------
      await employer.goto(`/listings/${job.id}`);
      // `exact`: "Shortlist" would otherwise also match the "Shortlisted" filter tab.
      await employer.getByRole("button", { name: "Shortlist", exact: true }).first().click();
      await employer.getByRole("button", { name: /^Shortlisted/ }).first().click();
      await employer.getByRole("button", { name: "Reveal Contact", exact: true }).first().click();

      // Revealing moves a shortlisted applicant to Contacted, listed under "Connected".
      await employer.getByRole("button", { name: /^Connected/ }).first().click();
      await expect(employer.getByText(APPLICANT_PHONE).first()).toBeVisible();
      await capture(employer, testInfo, "02-employer-contact-revealed");

      await employer.getByRole("button", { name: "Mark as hired", exact: true }).first().click();
      await expect(employer.getByRole("button", { name: "Mark as hired", exact: true })).toHaveCount(0);

      // ---- 5. One hire fills the one vacancy: close the job as filled ------------
      await expect(employer.getByText("You have hired for this job")).toBeVisible();
      await capture(employer, testInfo, "03-employer-offered-fill");
      await employer.getByRole("button", { name: "Close job as filled" }).click();
      await expect(employer.getByText("You have hired for this job")).toHaveCount(0);
      expect(await publicTitles(), "a filled job leaves the public board").not.toContain(title);
      await capture(employer, testInfo, "04-employer-job-filled");

      // ---- 6. The job seeker sees they were hired --------------------------------
      await applicant.goto("/listings/my-applications");
      await expect(applicant.getByText(title).first()).toBeVisible();
      await expect(applicant.getByText("Congratulations! The employer has hired you.").first()).toBeVisible();
      await capture(applicant, testInfo, "05-applicant-hired");
    } finally {
      // Closing must never mask the real failure.
      for (const context of [partnerContext, customerContext]) {
        await context.close().catch(() => undefined);
      }
    }
  });
});
