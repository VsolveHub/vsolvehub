import { setupServer } from "msw/node";

import { handlers } from "./handlers";

/**
 * MSW server for Vitest.
 *
 * Wire it once in a setup file:
 *
 * ```ts
 * import { server } from "@vsolve/testing/msw/node";
 *
 * beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
 * afterEach(() => server.resetHandlers());
 * afterAll(() => server.close());
 * ```
 *
 * `onUnhandledRequest: "error"` is deliberate: a request to an endpoint with no
 * handler means the client is calling something the contract does not publish,
 * which is exactly the mistake this architecture exists to prevent. Failing
 * loudly beats silently passing through to a real network.
 */
export const server = setupServer(...handlers);

export { handlers, createHandlers, TEST_API_BASE_URL } from "./handlers";
export * as scenarios from "./scenarios";
