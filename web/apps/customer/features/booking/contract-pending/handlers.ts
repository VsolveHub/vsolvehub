import { HttpResponse, http, type HttpHandler } from "msw";

import {
  availability,
  capacityHold,
  cart,
  eligiblePartners,
  instantPreCheck,
  quote,
} from "./fixtures";

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
    http.post(url("/api/v1/booking/availability/"), () =>
      HttpResponse.json(availability()),
    ),

    http.post(url("/api/v1/booking/eligible-partners/"), () =>
      HttpResponse.json(eligiblePartners()),
    ),

    http.post(url("/api/v1/booking/capacity-holds/"), () =>
      HttpResponse.json(capacityHold(), { status: 201 }),
    ),

    // A refusal is a 200, not an error status — see the proposal. Tests wanting
    // a refusal override this handler rather than relying on a pessimistic mock.
    http.post(url("/api/v1/booking/instant/pre-check/"), () =>
      HttpResponse.json(instantPreCheck()),
    ),

    http.post(url("/api/v1/booking/quote/"), () => HttpResponse.json(quote())),

    http.get(url("/api/v1/cart/"), () => HttpResponse.json(cart())),
  ];
}
