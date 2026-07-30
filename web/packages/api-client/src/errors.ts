import type { components } from "./generated/schema";

/** The error envelope as published by the Django contract. */
export type ApiErrorDetail = components["schemas"]["ApiErrorDetail"];

/**
 * Recovery intent — what the UI should offer the customer or partner next.
 *
 * This is deliberately separate from {@link ApiRequestError.isTransportRetryable}.
 * Automatic retry safety and human recovery are different questions, and
 * conflating them produces both silent duplicate mutations and dead ends where
 * the user is told "something went wrong" with no way forward.
 *
 * Every booking-stage error must be able to answer, per plan document 03:
 * what happened, whether money or booking state changed, and what to do next.
 */
export type RecoveryIntent =
  /** Safe to present a plain "Try again" affordance. */
  | "retry"
  /** Session is gone or insufficient; send the user through login. */
  | "reauthenticate"
  /** The chosen slot, provider or capacity is no longer valid; re-select. */
  | "choose_again"
  /** A usable payment instrument is required before continuing. */
  | "add_payment_method"
  /** Input is invalid; focus the offending field. */
  | "fix_input"
  /** Wait for an authoritative result rather than acting (payment pending). */
  | "await_confirmation"
  /** Nothing the user can do; surface a reference and a support path. */
  | "contact_support";

/**
 * HTTP statuses that are safe to retry at the transport layer.
 *
 * 409 is excluded on purpose: a conflict means the world changed (a slot was
 * taken, a hold expired), so retrying the identical request just fails again.
 * The user has to choose again.
 */
const TRANSPORT_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Domain error codes whose recovery is known from the contract and plan.
 * Unknown codes fall back to status-based classification, so a newly added
 * backend code degrades to a sensible default instead of breaking the client.
 */
const RECOVERY_BY_CODE: Record<string, RecoveryIntent> = {
  // Identity
  AUTHENTICATION_REQUIRED: "reauthenticate",
  SESSION_EXPIRED: "reauthenticate",
  PERMISSION_DENIED: "contact_support",
  OTP_INVALID: "fix_input",
  OTP_EXPIRED: "retry",
  OTP_RATE_LIMITED: "retry",

  // Capacity and scheduling
  SLOT_NO_LONGER_AVAILABLE: "choose_again",
  CAPACITY_HOLD_EXPIRED: "choose_again",
  NO_PARTNER_ACCEPTED: "choose_again",
  ELIGIBLE_POOL_EXHAUSTED: "choose_again",
  INSTANT_UNAVAILABLE: "choose_again",
  NOT_SERVICEABLE: "choose_again",

  // Pricing and checkout
  QUOTE_EXPIRED: "retry",
  CHECKOUT_SESSION_EXPIRED: "retry",
  PAYMENT_METHOD_REQUIRED: "add_payment_method",
  PAYMENT_PENDING: "await_confirmation",
  PAYMENT_FAILED: "retry",

  // Validation
  VALIDATION_ERROR: "fix_input",
  INVALID_INPUT: "fix_input",
};

/** Base class so callers can catch every failure this package produces. */
export abstract class ApiClientError extends Error {
  abstract readonly isTransportRetryable: boolean;
  abstract readonly recovery: RecoveryIntent;

  /** Backend correlation id, when the server managed to produce one. */
  readonly requestId: string | null;

  protected constructor(message: string, requestId: string | null) {
    super(message);
    this.name = new.target.name;
    this.requestId = requestId;
  }
}

/** The server responded with a structured, contract-shaped error envelope. */
export class ApiRequestError extends ApiClientError {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly isTransportRetryable: boolean;
  readonly recovery: RecoveryIntent;

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message, detail.request_id ?? null);
    this.status = status;
    this.code = detail.code;
    this.details = detail.details ?? null;
    this.isTransportRetryable = TRANSPORT_RETRYABLE_STATUSES.has(status);
    this.recovery = RECOVERY_BY_CODE[detail.code] ?? defaultRecoveryForStatus(status);
  }

  /**
   * Field-addressable validation messages, when the backend supplied them.
   *
   * The published contract types `details` as unknown, so this narrows
   * defensively rather than asserting a shape the contract does not promise.
   */
  get fieldErrors(): Record<string, string[]> {
    if (!this.details || typeof this.details !== "object" || Array.isArray(this.details)) {
      return {};
    }
    const result: Record<string, string[]> = {};
    for (const [field, value] of Object.entries(this.details as Record<string, unknown>)) {
      if (typeof value === "string") result[field] = [value];
      else if (Array.isArray(value)) result[field] = value.filter((v) => typeof v === "string");
    }
    return result;
  }
}

/**
 * The request never produced a usable HTTP response: offline, DNS failure,
 * TLS failure, timeout or an aborted navigation.
 */
export class ApiNetworkError extends ApiClientError {
  readonly isTransportRetryable = true;
  readonly recovery: RecoveryIntent = "retry";
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message, null);
    this.cause = cause;
  }
}

/**
 * A response arrived but did not match the published contract — typically an
 * HTML error page from a proxy or load balancer rather than the API.
 *
 * Treated as a distinct class so it can be alerted on: it means something
 * between the browser and Django is misbehaving, not that the user did
 * anything wrong.
 */
export class ApiContractError extends ApiClientError {
  readonly isTransportRetryable: boolean;
  readonly recovery: RecoveryIntent;
  readonly status: number;
  readonly bodyPreview: string;

  constructor(status: number, bodyPreview: string) {
    super(
      `The server returned an unexpected response (HTTP ${status}). ` +
        "This has been recorded and no action was completed.",
      null,
    );
    this.status = status;
    this.bodyPreview = bodyPreview;
    this.isTransportRetryable = TRANSPORT_RETRYABLE_STATUSES.has(status);
    this.recovery = this.isTransportRetryable ? "retry" : "contact_support";
  }
}

function defaultRecoveryForStatus(status: number): RecoveryIntent {
  if (status === 401) return "reauthenticate";
  if (status === 403) return "contact_support";
  if (status === 409) return "choose_again";
  if (status === 422 || status === 400) return "fix_input";
  if (TRANSPORT_RETRYABLE_STATUSES.has(status)) return "retry";
  return "contact_support";
}

/** Narrows an unknown error-envelope body to the contract shape. */
export function parseErrorEnvelope(body: unknown): ApiErrorDetail | null {
  if (!body || typeof body !== "object") return null;
  const envelope = body as { error?: unknown };
  if (!envelope.error || typeof envelope.error !== "object") return null;

  const detail = envelope.error as Record<string, unknown>;
  if (typeof detail.code !== "string" || typeof detail.message !== "string") return null;

  return {
    code: detail.code,
    message: detail.message,
    details: detail.details ?? null,
    request_id: typeof detail.request_id === "string" ? detail.request_id : null,
  };
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** True when the failure is safe for an automatic transport-level retry. */
export function isTransportRetryable(error: unknown): boolean {
  return isApiClientError(error) ? error.isTransportRetryable : false;
}
