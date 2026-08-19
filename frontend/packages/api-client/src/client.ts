import createClient, { type Client, type Middleware } from "openapi-fetch";

import {
  ApiContractError,
  ApiNetworkError,
  ApiRequestError,
  isApiClientError,
  parseErrorEnvelope,
} from "./errors";
import { createCsrfStore, type CsrfStore } from "./csrf";
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
   * Supplies a CSRF token from outside the browser bootstrap.
   *
   * Server-side rendering has no place to keep one and never mutates, so this is
   * only for tests and for a host that already holds a valid token.
   */
  getCsrfToken?: () => string | undefined;
  /**
   * How long any single request may take before it is abandoned.
   *
   * `0` disables the deadline. See {@link DEFAULT_REQUEST_TIMEOUT_MS} for why
   * there is one at all.
   */
  timeoutMs?: number;
}

/**
 * The deadline on every request.
 *
 * ## Why this exists
 *
 * `fetch` has no default timeout. A request whose connection is severed without
 * a close — a dev server restarting, a proxy dropping a socket, a phone moving
 * between cell and wifi — leaves a promise that never settles and never
 * rejects. Nothing downstream can recover from that: a TanStack mutation stays
 * `isPending` forever, so the button that fired it spins forever, shows no
 * error, and offers no retry. The person is left looking at a spinner for a
 * request that is not merely slow but *gone*.
 *
 * That is not a hypothetical. It is the failure that produced a "Review and
 * send" button spinning with zero requests in flight, and it would have
 * happened on any screen in any of the three apps, because they all send
 * through this one client.
 *
 * ## Why thirty seconds
 *
 * Long enough that a slow request on a mid-range Android over a poor Indian
 * mobile network still completes — the environment this product actually runs
 * in — and short enough that a person is told something went wrong while they
 * are still looking at the screen. Django's own slowest published path answers
 * well inside it.
 *
 * A timeout is reported as a network failure rather than as a cancellation, so
 * it reaches the screen as "could not reach us, nothing was submitted" with a
 * retry, which is both true and actionable.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Local send/receive timestamps, retained so callers can calibrate precisely. */
interface RequestTiming {
  sentAtMs: number;
  receivedAtMs: number;
}

const timingByResponse = new WeakMap<Response, RequestTiming>();

const CSRF_BOOTSTRAP_PATH = "/api/v1/auth/csrf/";

/** Django's stable code for a rejected or rotated CSRF token (contract 1.3.0). */
const CSRF_FAILED_CODE = "csrf_failed";

/**
 * Codes that mean "there is no usable session", whatever status carries them.
 *
 * DRF's `SessionAuthentication` supplies no `WWW-Authenticate` header, so an
 * unauthenticated request is answered **403**, not 401 — verified against the
 * running backend. Watching only for 401 meant a session that ended mid-flow
 * never told sibling tabs and never cleared cached user data; the code is the
 * reliable discriminator, and a genuine authorization refusal says
 * `permission_denied` instead.
 */
const SESSION_LOST_CODES = new Set(["not_authenticated", "session_expired"]);

function pathOf(request: Request): string | null {
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

/**
 * Reads `{ csrf_token }` out of a bootstrap response without going back through
 * the client, which would recurse: the bootstrap is itself a request.
 */
async function readBootstrapToken(response: Response): Promise<string | null> {
  if (!response.ok) return null;
  try {
    const body: unknown = await response.clone().json();
    const token = (body as { csrf_token?: unknown }).csrf_token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** Reads the envelope code without consuming the body the caller still needs. */
async function errorCodeOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json();
    return parseErrorEnvelope(body)?.code ?? null;
  } catch {
    return null;
  }
}

/** True when the server rejected the token we sent, rather than the request. */
async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  return (await errorCodeOf(response)) === CSRF_FAILED_CODE;
}

/** True when the response says the session is gone, on 401 or on DRF's 403. */
export async function isSessionLost(response: Response): Promise<boolean> {
  if (response.status === 401) return true;
  if (response.status !== 403) return false;
  const code = await errorCodeOf(response);
  return code !== null && SESSION_LOST_CODES.has(code);
}

/**
 * Wraps a fetch so no request can outlive its deadline.
 *
 * ## Why the timeout is distinguished from a cancellation
 *
 * `request` below deliberately re-throws `AbortError` untouched, because an
 * abort normally means the *caller* walked away — a component unmounted, a
 * query was superseded — and reporting that as a network failure would put an
 * error on a screen nobody is looking at any more. A deadline is the opposite:
 * nobody walked away, the request died, and the person is still waiting. So the
 * timeout is converted here, before it can be mistaken for the other thing.
 *
 * A caller's own signal is still honoured — aborting theirs aborts ours — and
 * that path stays a cancellation, exactly as it was.
 */
function withDeadline(
  send: (request: Request) => Promise<Response>,
  timeoutMs: number,
): (request: Request) => Promise<Response> {
  if (timeoutMs <= 0) return send;

  return async (request: Request): Promise<Response> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const callerSignal = request.signal;
    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener("abort", onCallerAbort);

    // Cloned before rebuilding: `new Request(input, init)` reads the input's
    // body, and the CSRF path re-clones the original to retry a rotated token.
    // Consuming it here would leave that retry with nothing to send.
    const attempt = send(new Request(request.clone(), { signal: controller.signal }));

    // Raced, not merely aborted.
    //
    // Signalling the abort is what frees the socket, but it is not what makes
    // the caller safe: a transport that ignores its signal would leave `attempt`
    // pending forever, which is precisely the failure this function exists to
    // end. The race guarantees the deadline is honoured whatever the transport
    // beneath it chooses to do.
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        // Reject *before* aborting, and the order is load-bearing. `abort()`
        // makes the transport reject its own promise immediately, so aborting
        // first lets a bare `AbortError` win the race — which `request` below
        // then re-throws untouched as a cancellation, leaving the caller with
        // the raw DOMException instead of a diagnosis. Settling the deadline
        // first is what guarantees the timeout is the answer the caller sees.
        reject(
          new ApiNetworkError(
            "Vsolve Hub took too long to answer. Nothing was submitted — try again.",
            // No underlying cause: nothing failed, the answer simply never came.
            // Passing the eventual `AbortError` would attribute the timeout to
            // the cancellation this function performs to clean up after it.
            null,
          ),
        );
        controller.abort();
      }, timeoutMs);
    });

    // The loser of the race still settles later. Left alone its rejection is an
    // unhandled promise, which in a browser is a console error nobody can act on
    // and in Node can take a process down.
    attempt.catch(() => undefined);

    try {
      return await Promise.race([attempt, deadline]);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  };
}

/**
 * Creates the typed API client.
 *
 * Responsibilities kept here rather than at call sites, so no screen can
 * accidentally skip them:
 *  - cookie session credentials on every request
 *  - CSRF bootstrap, header injection and one rotation retry on every unsafe method
 *  - server-clock calibration from the `Date` response header
 *  - a single place that observes 401 for session recovery
 *
 * Business behaviour is never added here. This layer moves bytes; Django owns
 * prices, capacity, state transitions and payment truth.
 */
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const { baseUrl, fetch: customFetch, onUnauthorized, getCsrfToken } = options;
  const send = customFetch ?? ((request: Request) => fetch(request));
  const fetchImpl = withDeadline(send, options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);

  /**
   * Fetches a token directly rather than through the client.
   *
   * Going through the client would re-enter this same middleware and, on an
   * unsafe method, recurse into another bootstrap.
   */
  const csrf: CsrfStore = createCsrfStore(async () => {
    const response = await fetchImpl(
      new Request(`${baseUrl}${CSRF_BOOTSTRAP_PATH}`, {
        method: "GET",
        credentials: "include",
      }),
    );
    return readBootstrapToken(response);
  });

  /**
   * Attaches the CSRF header, and retries once when Django says the token is
   * stale.
   *
   * The retry exists because Django rotates the token whenever the session
   * rotates — login, logout, role switch. Without it, the first mutation after
   * any of those fails with a 403 the person cannot act on, and the fix they
   * would reach for is a page reload that loses the form.
   *
   * Exactly one retry, and only for `csrf_failed`. A second rejection is a real
   * failure, and retrying anything else would resend a command whose effect we
   * cannot reason about.
   */
  const fetchWithCsrf = async (request: Request): Promise<Response> => {
    const isUnsafe = UNSAFE_METHODS.has(request.method.toUpperCase());
    const isBootstrap = pathOf(request) === CSRF_BOOTSTRAP_PATH;

    if (!isUnsafe || isBootstrap) return fetchImpl(request);

    const supplied = getCsrfToken?.();
    const token = supplied ?? (await csrf.ensure());

    const send = (value: string | null): Promise<Response> => {
      const attempt = request.clone();
      if (value) attempt.headers.set("X-CSRFToken", value);
      return fetchImpl(attempt);
    };

    const response = await send(token);
    if (!(await isCsrfRejection(response))) return response;

    csrf.invalidate();
    const rotated = supplied ?? (await csrf.ensure());
    // Nothing new to send: surface the original rejection rather than replaying
    // the identical request and calling the second 403 a different outcome.
    if (!rotated || rotated === token) return response;

    return send(rotated);
  };

  const client = createClient<paths>({
    baseUrl,
    // Session cookies are HttpOnly and set by Django; the browser must send them
    // cross-origin. No session value is ever read from JavaScript, and the CSRF
    // token lives in memory only — never in browser storage.
    credentials: "include",
    fetch: fetchWithCsrf,
  });

  const sentAtByRequestId = new Map<string, number>();

  const middleware: Middleware = {
    onRequest({ request, id }) {
      sentAtByRequestId.set(id, Date.now());
      // The CSRF header is attached in `fetchWithCsrf` rather than here: the
      // token may need fetching, and this hook is synchronous.
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

      // Deliberately not `status === 401` alone: DRF answers 403 for an absent
      // session under SessionAuthentication, and treating that as a permission
      // problem leaves a logged-out tab believing it is still signed in.
      void isSessionLost(response).then((lost) => {
        if (!lost) return;
        // The session is gone, so the token bound to it is too.
        csrf.invalidate();
        try {
          onUnauthorized?.();
        } catch {
          // A failing recovery hook must not mask the original API result.
        }
      });

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

  if (response.ok && data !== undefined) {
    // Calibrate from the body before returning it.
    //
    // This is not an optimisation — for a browser it is the *only* calibration
    // that works. `Date` is not a CORS-safelisted response header, so unless
    // Django sends `Access-Control-Expose-Headers: Date` the header path in the
    // middleware reads `null` on every cross-origin call and `serverClock`
    // silently falls back to the device clock. That is the exact failure the
    // clock exists to prevent, and it is invisible: a countdown on a device
    // running ten minutes fast simply shows the wrong number.
    //
    // Doing it here rather than at each call site means an endpoint that
    // publishes `server_now` calibrates every screen, including the ones whose
    // payloads carry no timestamp of their own. Costs nothing: `data` is already
    // parsed, and `readServerNow` returns null for payloads without the field.
    //
    // See `contracts/proposals/0010-server-clock-calibration.md` for the header
    // fix, which is still worth having — it covers the endpoints that publish no
    // `server_now` at all.
    calibrateFromPayload(data, response);
    return data;
  }
  if (
    response.ok &&
    error === undefined &&
    (response.status === 204 ||
      response.status === 205 ||
      response.headers.get("content-type") === null)
  ) {
    return undefined as TData;
  }

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
    // Already one of ours — the deadline's timeout, most often. Re-wrapping it
    // would flatten a precise diagnosis into the generic one below and tell
    // somebody to check a connection that is working fine.
    if (isApiClientError(cause)) throw cause;
    throw new ApiNetworkError(
      "Could not reach Vsolve Hub. Check your connection and try again. " +
        "Nothing was submitted.",
      cause,
    );
  }
  return unwrap(result);
}
