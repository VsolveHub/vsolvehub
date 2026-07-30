import createClient, { type Client, type Middleware } from "openapi-fetch";

import {
  ApiContractError,
  ApiNetworkError,
  ApiRequestError,
  parseErrorEnvelope,
} from "./errors";
import { readServerNow, serverClock } from "./server-clock";
import type { paths } from "./generated/schema";

/** Methods that require Django CSRF protection for cookie-authenticated sessions. */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ApiClient = Client<paths>;

export interface CreateApiClientOptions {
  /** Public API origin, e.g. `https://api.vsolvehub.com`. No trailing slash needed. */
  baseUrl: string;
  /** Injectable fetch for tests and server-side rendering. */
  fetch?: (input: Request) => Promise<Response>;
  /**
   * Called when the API reports the session is gone. Apps use this to clear
   * cached user state and route to login. It must not itself throw.
   */
  onUnauthorized?: () => void;
  /**
   * Supplies the CSRF token when the default cookie read is not available —
   * for example during server-side rendering, where `document` does not exist.
   */
  getCsrfToken?: () => string | undefined;
}

/** Local send/receive timestamps, retained so callers can calibrate precisely. */
interface RequestTiming {
  sentAtMs: number;
  receivedAtMs: number;
}

const timingByResponse = new WeakMap<Response, RequestTiming>();

function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Creates the typed API client.
 *
 * Responsibilities kept here rather than at call sites, so no screen can
 * accidentally skip them:
 *  - cookie session credentials on every request
 *  - Django CSRF header on every unsafe method
 *  - server-clock calibration from the `Date` response header
 *  - a single place that observes 401 for session recovery
 *
 * Business behaviour is never added here. This layer moves bytes; Django owns
 * prices, capacity, state transitions and payment truth.
 */
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const { baseUrl, fetch: customFetch, onUnauthorized, getCsrfToken } = options;

  const client = createClient<paths>({
    baseUrl,
    // Session cookies are HTTP-only and set by Django; the browser must send
    // them cross-origin. No token is ever read from JavaScript.
    credentials: "include",
    ...(customFetch ? { fetch: customFetch } : {}),
  });

  const sentAtByRequestId = new Map<string, number>();

  const middleware: Middleware = {
    onRequest({ request, id }) {
      sentAtByRequestId.set(id, Date.now());

      if (UNSAFE_METHODS.has(request.method.toUpperCase())) {
        const token = getCsrfToken?.() ?? readCsrfCookie();
        if (token) request.headers.set("X-CSRFToken", token);
      }
      return request;
    },

    onResponse({ response, id }) {
      const receivedAtMs = Date.now();
      const sentAtMs = sentAtByRequestId.get(id);
      sentAtByRequestId.delete(id);

      if (sentAtMs !== undefined) {
        timingByResponse.set(response, { sentAtMs, receivedAtMs });

        // The `Date` header is present on every response and costs nothing to
        // read. One-second granularity is acceptable for hold and offer
        // countdowns; see server-clock.ts for the precision contract.
        const dateHeader = response.headers.get("date");
        if (dateHeader) {
          const serverTimeMs = Date.parse(dateHeader);
          if (Number.isFinite(serverTimeMs)) {
            serverClock.record(serverTimeMs, sentAtMs, receivedAtMs, "date_header");
          }
        }
      }

      if (response.status === 401) {
        try {
          onUnauthorized?.();
        } catch {
          // A failing recovery hook must not mask the original API result.
        }
      }

      return response;
    },

    onError({ id }) {
      sentAtByRequestId.delete(id);
      // Returning nothing lets openapi-fetch surface the original failure,
      // which `unwrap` converts into an ApiNetworkError.
      return undefined;
    },
  };

  client.use(middleware);
  return client;
}

/**
 * Improves clock precision using an explicit `server_now` field.
 *
 * The `Date` header is only second-precise. Endpoints that carry `server_now`
 * (offers, holds, work sessions) can feed it back here for millisecond
 * accuracy. Call it right after a successful request:
 *
 * ```ts
 * const { data, response } = await api.GET("/api/v1/partner/offers/");
 * if (data) calibrateFromPayload(data, response);
 * ```
 */
export function calibrateFromPayload(payload: unknown, response: Response): void {
  const serverTimeMs = readServerNow(payload);
  if (serverTimeMs === null) return;

  const timing = timingByResponse.get(response);
  if (!timing) return;

  serverClock.record(serverTimeMs, timing.sentAtMs, timing.receivedAtMs, "server_now");
}

/** The shape openapi-fetch returns from every operation. */
interface FetchResult<TData> {
  data?: TData;
  error?: unknown;
  response: Response;
}

/**
 * Converts an openapi-fetch result into a value or a typed exception.
 *
 * TanStack Query needs rejected promises to drive its error states, so query
 * and mutation functions wrap every call in this. Success paths return data
 * that is non-optional, which removes a null check from every screen.
 */
export function unwrap<TData>(result: FetchResult<TData>): TData {
  const { data, error, response } = result;

  if (response.ok && data !== undefined) return data;

  const detail = parseErrorEnvelope(error);
  if (detail) throw new ApiRequestError(response.status, detail);

  // A response arrived but was not contract-shaped: an HTML proxy error page, a
  // truncated body, or a 204 where the caller expected content.
  const preview = typeof error === "string" ? error.slice(0, 200) : "";
  throw new ApiContractError(response.status, preview);
}

/**
 * Wraps a thrown transport failure so callers only ever handle
 * `ApiClientError` subclasses.
 *
 * openapi-fetch rejects when fetch itself fails (offline, DNS, TLS, abort).
 */
export async function request<TData>(
  operation: () => Promise<FetchResult<TData>>,
): Promise<TData> {
  let result: FetchResult<TData>;
  try {
    result = await operation();
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiNetworkError(
      "Could not reach Vsolve Hub. Check your connection and try again. " +
        "Nothing was submitted.",
      cause,
    );
  }
  return unwrap(result);
}
