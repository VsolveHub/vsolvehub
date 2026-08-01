import { HttpResponse, delay, http, type HttpHandler, type JsonBodyType } from "msw";

import { apiError } from "../fixtures";
import { TEST_API_BASE_URL } from "./handlers";

/**
 * Opt-in failure scenarios.
 *
 * The plan requires the frontend to prove its recovery paths, not just its happy
 * path: slot taken during a hold, payment failure, duplicate submission, offer
 * expiry, network loss, provider outage (plan 06 browser E2E list).
 *
 * Each builder returns a handler to pass to `server.use(...)` so a single test
 * overrides a single endpoint. Tests stay readable and no global mock has to be
 * pessimistic.
 */

interface ScenarioOptions {
  baseUrl?: string;
  method?: "get" | "post" | "patch" | "delete";
}

function route(path: string, options: ScenarioOptions = {}) {
  const baseUrl = options.baseUrl ?? TEST_API_BASE_URL;
  return `${baseUrl}${path}`;
}

/** A contract-shaped domain error with a chosen code and status. */
export function respondsWithApiError(
  path: string,
  code: string,
  message: string,
  status: number,
  options: ScenarioOptions = {},
): HttpHandler {
  const method = options.method ?? "get";
  return http[method](route(path, options), () =>
    HttpResponse.json(apiError(code, message), { status }),
  );
}

/**
 * The capacity that was held is gone. The customer must choose again, and the UI
 * must state that no charge was made.
 */
export function capacityHoldExpired(path: string, options: ScenarioOptions = {}): HttpHandler {
  return respondsWithApiError(
    path,
    "CAPACITY_HOLD_EXPIRED",
    "That time is no longer held. You have not been charged.",
    409,
    { method: "post", ...options },
  );
}

/** The chosen slot was taken by another customer mid-flow. */
export function slotNoLongerAvailable(path: string, options: ScenarioOptions = {}): HttpHandler {
  return respondsWithApiError(
    path,
    "SLOT_NO_LONGER_AVAILABLE",
    "That time is no longer available.",
    409,
    { method: "post", ...options },
  );
}

/** Session gone mid-flow: the client must route to login without losing state. */
export function sessionExpired(path: string, options: ScenarioOptions = {}): HttpHandler {
  return respondsWithApiError(
    path,
    "SESSION_EXPIRED",
    "Your session expired. Log in to continue.",
    401,
    options,
  );
}

/** Field-addressable validation failure, for form error placement. */
export function validationFailed(
  path: string,
  fields: Record<string, string[]>,
  options: ScenarioOptions = {},
): HttpHandler {
  const method = options.method ?? "post";
  return http[method](route(path, options), () =>
    HttpResponse.json(
      apiError("VALIDATION_ERROR", "Check the highlighted fields.", { details: fields }),
      { status: 422 },
    ),
  );
}

/**
 * The connection drops with no response.
 *
 * On a financial mutation this is the ambiguous case: the request may have
 * reached Django. The UI must say "we are confirming" and must not offer a
 * second Pay action.
 */
export function networkFailure(path: string, options: ScenarioOptions = {}): HttpHandler {
  const method = options.method ?? "post";
  return http[method](route(path, options), () => HttpResponse.error());
}

/**
 * A proxy returns HTML rather than the API error envelope.
 *
 * Exercises ApiContractError: the client must not crash trying to parse it, and
 * must not report it as a user mistake.
 */
export function proxyHtmlError(path: string, options: ScenarioOptions = {}): HttpHandler {
  const method = options.method ?? "get";
  return http[method](route(path, options), () =>
    HttpResponse.text("<html><body><h1>502 Bad Gateway</h1></body></html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    }),
  );
}

/** A slow endpoint, for loading-state and timeout assertions. */
export function slowResponse<T extends JsonBodyType>(
  path: string,
  body: T,
  delayMs = 3_000,
  options: ScenarioOptions = {},
): HttpHandler {
  const method = options.method ?? "get";
  return http[method](route(path, options), async () => {
    await delay(delayMs);
    return HttpResponse.json(body);
  });
}

/**
 * Records how many times an endpoint was called.
 *
 * Use to prove a double-click produced exactly one request, and that a retry
 * reused the same idempotency key.
 */
export function countingHandler<T extends JsonBodyType>(
  path: string,
  body: T,
  options: ScenarioOptions = {},
): { handler: HttpHandler; getCalls: () => { count: number; idempotencyKeys: string[] } } {
  const method = options.method ?? "post";
  let count = 0;
  const idempotencyKeys: string[] = [];

  const handler = http[method](route(path, options), ({ request }) => {
    count += 1;
    const key = request.headers.get("idempotency-key");
    if (key) idempotencyKeys.push(key);
    return HttpResponse.json(body);
  });

  return { handler, getCalls: () => ({ count, idempotencyKeys }) };
}
