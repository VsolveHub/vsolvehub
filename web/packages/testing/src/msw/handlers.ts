import { HttpResponse, http, type HttpHandler } from "msw";

import {
  address,
  apiError,
  authenticatedSession,
  category,
  otpIssued,
  serviceCard,
  serviceabilityResponse,
  userSession,
} from "../fixtures";

/**
 * Mock Service Worker handlers for every published contract endpoint.
 *
 * These let the whole frontend be built and tested before Django implements a
 * capability, without inventing response shapes: fixtures are typed against the
 * generated contract, so a mock cannot describe a payload Django will not send.
 *
 * Handlers cover the happy path. Failure paths are opt-in per test via the
 * builders in `./scenarios`, because a test asserting error recovery should say
 * so explicitly rather than relying on a globally pessimistic mock.
 */

/** Default API origin for tests. Override with `createHandlers({ baseUrl })`. */
export const TEST_API_BASE_URL = "http://localhost:8000";

export interface HandlerOptions {
  baseUrl?: string;
  /** Start the mock session logged out, so login flows can be exercised. */
  authenticated?: boolean;
}

export function createHandlers(options: HandlerOptions = {}): HttpHandler[] {
  const baseUrl = options.baseUrl ?? TEST_API_BASE_URL;
  const authenticated = options.authenticated ?? true;
  const url = (path: string) => `${baseUrl}${path}`;

  const requireAuth = () =>
    HttpResponse.json(
      apiError("AUTHENTICATION_REQUIRED", "Log in to continue."),
      { status: 401 },
    );

  return [
    // ---- Identity -------------------------------------------------------
    http.get(url("/api/v1/auth/csrf/"), () =>
      HttpResponse.json({ detail: "CSRF cookie set" }, {
        headers: { "set-cookie": "csrftoken=test-csrf-token; Path=/" },
      }),
    ),

    http.get(url("/api/v1/auth/session/"), () =>
      authenticated ? HttpResponse.json(authenticatedSession()) : requireAuth(),
    ),

    http.post(url("/api/v1/auth/otp/request/"), () => HttpResponse.json(otpIssued())),

    http.post(url("/api/v1/auth/otp/verify/"), () =>
      HttpResponse.json(authenticatedSession()),
    ),

    http.post(url("/api/v1/auth/logout/"), () => new HttpResponse(null, { status: 204 })),

    http.get(url("/api/v1/auth/sessions/"), () =>
      authenticated ? HttpResponse.json([userSession()]) : requireAuth(),
    ),

    http.delete(url("/api/v1/auth/sessions/:sessionId/"), () =>
      authenticated ? new HttpResponse(null, { status: 204 }) : requireAuth(),
    ),

    // ---- Addresses ------------------------------------------------------
    http.get(url("/api/v1/addresses/"), () =>
      authenticated ? HttpResponse.json([address()]) : requireAuth(),
    ),

    http.post(url("/api/v1/addresses/"), async ({ request }) => {
      if (!authenticated) return requireAuth();
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(address(body as never), { status: 201 });
    }),

    http.get(url("/api/v1/addresses/:addressId/"), ({ params }) =>
      authenticated
        ? HttpResponse.json(address({ id: String(params.addressId) }))
        : requireAuth(),
    ),

    http.patch(url("/api/v1/addresses/:addressId/"), async ({ params, request }) => {
      if (!authenticated) return requireAuth();
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(address({ id: String(params.addressId), ...body } as never));
    }),

    http.delete(url("/api/v1/addresses/:addressId/"), () =>
      authenticated ? new HttpResponse(null, { status: 204 }) : requireAuth(),
    ),

    // ---- Catalog --------------------------------------------------------
    http.get(url("/api/v1/categories/"), () => HttpResponse.json([category()])),

    http.get(url("/api/v1/categories/:categorySlug/services/"), ({ params }) =>
      HttpResponse.json([serviceCard({ category_slug: String(params.categorySlug) })]),
    ),

    http.get(url("/api/v1/services/:serviceSlug/"), ({ params }) => {
      const slug = String(params.serviceSlug);
      // Detail extends the card; the contract's ServiceDetail adds fields the
      // fixture layer does not yet model, so return the card shape plus the
      // required detail additions only when a test needs them.
      return HttpResponse.json(serviceCard({ slug }));
    }),

    http.get(url("/api/v1/services/:serviceSlug/configuration/"), () =>
      HttpResponse.json(
        apiError(
          "NOT_IMPLEMENTED_IN_MOCK",
          "Service configuration has no fixture yet. Add one when B3 needs it.",
        ),
        { status: 501 },
      ),
    ),

    // ---- Locations ------------------------------------------------------
    http.post(url("/api/v1/serviceability/check/"), () =>
      HttpResponse.json(serviceabilityResponse()),
    ),

    http.post(url("/api/v1/geocoding/reverse/"), () =>
      HttpResponse.json(
        apiError(
          "NOT_IMPLEMENTED_IN_MOCK",
          "Reverse geocode has no fixture yet. Add one when the address step needs it.",
        ),
        { status: 501 },
      ),
    ),

    // ---- Health ---------------------------------------------------------
    http.get(url("/api/v1/health/live/"), () => HttpResponse.json({ status: "ok" })),
    http.get(url("/api/v1/health/ready/"), () =>
      HttpResponse.json({ status: "ok", database: "ok", cache: "ok" }),
    ),
  ];
}

/** Happy-path handlers for an authenticated customer. */
export const handlers: HttpHandler[] = createHandlers();
