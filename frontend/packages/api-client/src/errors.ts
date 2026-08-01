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
 * HTTP statuses that are safe to retry automatically at the transport layer.
 *
 * 409 is excluded on purpose: a conflict means the world changed (a slot was
 * taken, a hold expired), so retrying the identical request just fails again.
 * The user has to choose again.
 *
 * This is a narrower question than the envelope's `retryable` flag — see
 * {@link ApiRequestError.isTransportRetryable}.
 */
const TRANSPORT_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Recovery for the error codes Django actually emits.
 *
 * ## Casing is the contract
 *
 * Every key is lowercase `snake_case`, because that is what
 * `common/errors/handler.py` produces: DRF's own `get_codes()` for built-in
 * failures, `validation_error` for any `ValidationError`, and the `default_code`
 * of each domain exception. The table was previously keyed `SCREAMING_CASE`, so
 * **no key ever matched** and every domain error silently fell through to
 * status-based classification. Nothing looked broken, which is what made it
 * worth fixing before more entries were added on top.
 *
 * ## Only codes that exist
 *
 * Entries for unbuilt domains — slots, quotes, capacity holds, payment — were
 * removed rather than re-cased. A mapping for a code no server sends is a guess
 * about a contract nobody has published, and it would have to be re-checked
 * against the real code set anyway. They come back one at a time as BE-06 to
 * BE-08 publish them.
 *
 * ## Unknown codes
 *
 * `defaultRecoveryForStatus` handles anything absent, so a code added by a newer
 * deployment degrades to a sensible action rather than breaking the client. That
 * is the fallback, not an excuse to leave the table empty: status alone cannot
 * tell `invalid_otp` (fix the code you typed) from `throttled` (wait).
 */
const RECOVERY_BY_CODE: Record<string, RecoveryIntent> = {
  // Identity and session — apps/identity
  not_authenticated: "reauthenticate",
  authentication_failed: "reauthenticate",
  session_expired: "reauthenticate",
  permission_denied: "contact_support",
  invalid_otp: "fix_input",
  otp_unavailable: "retry",
  throttled: "retry",

  // Validation. Django collapses every DRF ValidationError to this one code and
  // keeps the specific code inside `details`, so field errors are read from
  // `fieldErrors` rather than from the envelope code.
  validation_error: "fix_input",

  // Retry-safe command infrastructure — apps/foundation
  idempotency_in_progress: "await_confirmation",
  idempotency_key_reused: "contact_support",

  // Location — apps/locations
  geocoding_unavailable: "retry",
  address_archived: "choose_again",

  // Partner application — apps/partners
  partner_application_version_conflict: "retry",
  partner_application_incomplete: "fix_input",
  partner_schedule_invalid: "fix_input",
  partner_transition_not_allowed: "contact_support",
  partner_self_review_forbidden: "contact_support",
  partner_not_operationally_eligible: "contact_support",
  partner_presence_unavailable: "retry",
};

/**
 * Reads one field message out of a `details` entry.
 *
 * Accepts a bare string and the `{message, code}` object Django's exception
 * handler produces. Returns null for anything else so a number, a null or a
 * nested structure never reaches a form field as text.
 */
function readFieldMessage(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const message = (entry as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}

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
  readonly recovery: RecoveryIntent;

  /**
   * The server's own judgement: could a retry of this operation ever succeed?
   *
   * Semantic, not mechanical. `partner_application_version_conflict` is
   * `retryable: true` because saving again *after refetching the new version*
   * will work — not because resending the same request would. Use it to decide
   * whether to offer a "Try again" affordance at all.
   */
  readonly retryable: boolean;

  /**
   * Whether the query layer may silently resend the identical request.
   *
   * Deliberately stricter than {@link retryable}, and the two must not be
   * conflated: treating the server's semantic hint as permission to auto-retry
   * would resend a payment on a 409. Both have to agree — the status must be a
   * transport-level failure class, and the server must not have vetoed a retry.
   */
  readonly isTransportRetryable: boolean;

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message, detail.request_id ?? null);
    this.status = status;
    this.code = detail.code;
    this.details = detail.details ?? null;
    this.retryable = detail.retryable;
    this.isTransportRetryable = detail.retryable && TRANSPORT_RETRYABLE_STATUSES.has(status);
    this.recovery = RECOVERY_BY_CODE[detail.code] ?? defaultRecoveryForStatus(status);
  }

  /**
   * Field-addressable validation messages, when the backend supplied them.
   *
   * The published contract types `details` as unknown, so this narrows
   * defensively rather than asserting a shape the contract does not promise.
   *
   * Django's envelope serialises each DRF `ErrorDetail` as `{message, code}`,
   * so a validation failure arrives as `{phone_number: [{message, code}]}` and
   * not as a list of strings. Both are read here; anything else is dropped
   * rather than stringified, because `[object Object]` under a form field is
   * worse than no message at all.
   */
  get fieldErrors(): Record<string, string[]> {
    if (!this.details || typeof this.details !== "object" || Array.isArray(this.details)) {
      return {};
    }
    const result: Record<string, string[]> = {};
    for (const [field, value] of Object.entries(this.details as Record<string, unknown>)) {
      const entries = Array.isArray(value) ? value : [value];
      const messages = entries
        .map((entry) => readFieldMessage(entry))
        .filter((entry): entry is string => entry !== null);
      if (messages.length > 0) result[field] = messages;
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
    // Defaults to false when absent. An older deployment that predates the field
    // should not have its errors treated as retryable by omission.
    retryable: detail.retryable === true,
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
