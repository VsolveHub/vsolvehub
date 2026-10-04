/**
 * `@vsolve/api-client` — the only way frontend code talks to Django.
 *
 * Every request and response type in this package is generated from the
 * published OpenAPI contract at `contracts/openapi/v1.yaml`. Nothing here is
 * hand-written, and `src/generated/` is never edited by hand.
 *
 * When a screen needs an endpoint that does not exist yet, add a proposal under
 * `contracts/proposals/` instead of inventing a shape locally.
 */

export { createApiClient, unwrap, request, calibrateFromPayload } from "./client";
export { createCsrfStore, resetCsrfStateForTests } from "./csrf";
export type { CsrfStore } from "./csrf";
export type { ApiClient, CreateApiClientOptions } from "./client";

export {
  ApiClientError,
  ApiRequestError,
  ApiNetworkError,
  ApiContractError,
  isApiClientError,
  isApiRequestError,
  isTransportRetryable,
  parseErrorEnvelope,
} from "./errors";
export type { ApiErrorDetail, RecoveryIntent } from "./errors";

export { ServerClock, serverClock, readServerNow } from "./server-clock";
export type { ClockSample } from "./server-clock";

export {
  createIdempotencyKey,
  getStableIdempotencyKey,
  clearIdempotencyKey,
  clearAllIdempotencyKeys,
  hasIdempotencyKey,
} from "./idempotency";

export * as schema from "./types";
export type { Schemas } from "./types";
export type { paths, components, operations } from "./generated/schema";
