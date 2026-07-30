import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

/**
 * MSW worker for the browser: Playwright runs and local development against
 * capabilities Django has not implemented yet.
 *
 * Requires the service-worker file in the app's public directory:
 *
 * ```
 * pnpm dlx msw init apps/customer/public --save
 * ```
 *
 * That step is per-app and intentionally not run here — it writes into an
 * application's public assets, and it is only needed once a browser-level mock
 * is actually used. Vitest runs use `./node` and need no service worker.
 *
 * Start it only when explicitly enabled, never by default in a production build:
 *
 * ```ts
 * if (process.env.NEXT_PUBLIC_API_MOCKS === "enabled") {
 *   const { worker } = await import("@vsolve/testing/msw/browser");
 *   await worker.start({ onUnhandledRequest: "bypass" });
 * }
 * ```
 */
export const worker = setupWorker(...handlers);

export { handlers, createHandlers, TEST_API_BASE_URL } from "./handlers";
export * as scenarios from "./scenarios";
