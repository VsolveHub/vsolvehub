import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

/**
 * Browser-level smoke tests for route boundaries and shell availability.
 *
 * These are intentionally contract-light. Backend-backed acceptance flows should
 * be added only after the relevant Django endpoint is published and fixtureable;
 * until then E2E should prove routing, accessibility basics and honest boundary
 * copy rather than masking missing backend behavior with fake DTOs.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  /**
   * Three single-process `next start` servers share one machine, so the limit is
   * the servers, not the browser. Left at Playwright's default the suite was
   * flaky in a way that looked like UI defects — the same specs passed serially —
   * which is worse than being slow, because it teaches people to re-run failures
   * instead of reading them.
   */
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm.cmd start",
      cwd: "./apps/customer",
      url: "http://localhost:3000/icon.png",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: "pnpm.cmd start",
      cwd: "./apps/partner",
      url: "http://localhost:3001",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: "pnpm.cmd start",
      cwd: "./apps/admin",
      url: "http://localhost:3002",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "customer-chromium",
      testMatch: /customer\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3000",
      },
    },
    {
      /**
       * FE-08G's `/cart` acceptance.
       *
       * Its own project because it installs contract-shaped API routes for every
       * test, which the contract-independent customer specs must not inherit —
       * a shell test that silently ran against a stubbed backend would stop
       * proving the shell renders on its own.
       */
      name: "customer-cart",
      testMatch: /cart\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3000",
      },
    },
    {
      name: "partner-chromium",
      testMatch: /partner\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3001",
      },
    },
    {
      /**
       * FE-09's Customer group finding and recovery.
       *
       * Its own project for the same reason as `customer-cart`: it installs
       * contract-shaped API routes for every test, and the contract-independent
       * customer specs must not inherit them.
       */
      name: "customer-bookings",
      testMatch: /bookings\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3000",
      },
    },
    {
      /** FE-09's Partner offer inbox. */
      name: "partner-offers",
      testMatch: /offers\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3001",
      },
    },
    {
      /**
       * The Partner onboarding tree.
       *
       * Excluded from the contract-independent matrix for two milestones because
       * it needs a session — during which a render-prop-across-the-RSC-boundary
       * crash and a non-functional "Save and continue" both shipped. The session
       * is stubbed; see `apply.e2e.ts`.
       */
      name: "partner-apply",
      testMatch: /apply\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3001",
      },
    },
    {
      name: "admin-chromium",
      testMatch: /admin\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3002",
      },
    },
    {
      /**
       * The only project that talks to Django. It skips itself when the backend
       * is unreachable, so the rest of the suite stays runnable frontend-only —
       * see the header of `django.e2e.ts` for why a skip beats a failure here.
       */
      name: "django-acceptance",
      testMatch: /django\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3001",
      },
    },
  ],
});
