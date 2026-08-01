import { HttpResponse, http, type HttpHandler } from "msw";

import { cart, checkoutSession, quote, windows } from "./fixtures";

/**
 * MSW handlers for the proposed booking endpoints.
 *
 * These live here rather than in `@vsolve/testing` on purpose. That package's
 * handlers cover *published* contract operations and its fixtures are typed
 * against the generated schema — an invariant worth keeping. Mixing in handlers
 * for endpoints that do not exist would quietly weaken it, and a package under
 * `packages/` should not depend on a directory inside an app anyway.
 *
 * Compose them: `setupServer(...handlers, ...pendingBookingHandlers())`.
 */

export const PENDING_BASE_URL = "http://localhost:8000";

export interface PendingHandlerOptions {
  baseUrl?: string;
}

export function pendingBookingHandlers(
  options: PendingHandlerOptions = {},
): HttpHandler[] {
  const baseUrl = options.baseUrl ?? PENDING_BASE_URL;
  const url = (path: string) => `${baseUrl}${path}`;

  return [
    http.post(url("/api/v1/booking/windows/"), () => HttpResponse.json(windows())),

    http.post(url("/api/v1/quotes/"), () => HttpResponse.json(quote())),

    // Defaults to mid-search. A test wanting the committed or exhausted state
    // overrides this handler rather than relying on an optimistic mock — an
    // enabled pay button is exactly what must not appear by default.
    http.get(url("/api/v1/checkout-sessions/:reference/"), () =>
      HttpResponse.json(checkoutSession()),
    ),

    http.post(url("/api/v1/checkout-sessions/"), () =>
      HttpResponse.json(checkoutSession({ status: "CREATED", search_deadline_at: null }), {
        status: 201,
      }),
    ),

    http.get(url("/api/v1/cart/"), () => HttpResponse.json(cart())),
  ];
}
