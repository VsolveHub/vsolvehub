import { defineConfig, devices } from "@playwright/test";

/**
 * TEMPORARY — a one-off runner for the FE-10 payment gate on this machine.
 *
 * Identical to `playwright.config.ts` for the `customer-payment` project, except
 * that the Customer app is served on 3100. Ports 3000-3003 are held here by an
 * unrelated container that binds them without serving, so `next start` cannot
 * take 3000 and the committed config cannot run as written.
 *
 * Not committed. Delete after the run.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [["list"]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npx next start --port 3100",
      cwd: "./apps/customer",
      url: "http://127.0.0.1:3100/icon.png",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "customer-payment",
      testMatch: /payment\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:3100",
      },
    },
  ],
});
