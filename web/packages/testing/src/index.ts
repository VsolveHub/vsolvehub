/**
 * `@vsolve/testing` — shared frontend test infrastructure.
 *
 * Import paths:
 *   `@vsolve/testing`              fixtures and handler builders (runtime-agnostic)
 *   `@vsolve/testing/msw/node`     MSW server for Vitest
 *   `@vsolve/testing/msw/browser`  MSW worker for Playwright and local dev
 *
 * The node and browser entries are separate so a Vitest run never pulls in
 * `msw/browser` (which expects a service worker) and a browser bundle never
 * pulls in `msw/node`.
 */

export * as fixtures from "./fixtures";
export { createHandlers, handlers, TEST_API_BASE_URL } from "./msw/handlers";
export type { HandlerOptions } from "./msw/handlers";
export * as scenarios from "./msw/scenarios";
