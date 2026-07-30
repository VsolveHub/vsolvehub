import { isApiClientError, isTransportRetryable } from "@vsolve/api-client";

/**
 * Retry policy.
 *
 * Two rules that matter more than the numbers:
 *
 * 1. Only transport failures are retried. A 409 means the world changed — the
 *    slot went, the hold expired — so retrying the same request just fails
 *    again and hides a decision the user needs to make.
 *
 * 2. Mutations are never retried automatically unless the caller opts in with an
 *    idempotency key. A blind retry on `POST /payments` is a duplicate charge
 *    risk, and the client must not rely on the server catching every case.
 */

const MAX_QUERY_RETRIES = 2;

/** Retry predicate for read queries. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  // An unrecognised error is not known to be safe, so it is not retried.
  if (!isApiClientError(error)) return false;
  return isTransportRetryable(error);
}

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters here: without it, every tab that lost connectivity at the same
 * moment retries in lockstep and hits the API as a synchronised burst the
 * instant the network returns.
 */
export function queryRetryDelay(attemptIndex: number): number {
  const base = Math.min(1_000 * 2 ** attemptIndex, 8_000);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

/**
 * Retry predicate for mutations.
 *
 * Default is no retry. Pass `idempotent: true` only when the request carries a
 * stable idempotency key, so a retry provably cannot duplicate an effect.
 */
export function shouldRetryMutation(
  failureCount: number,
  error: unknown,
  options: { idempotent?: boolean } = {},
): boolean {
  if (!options.idempotent) return false;
  if (failureCount >= 1) return false;
  return isTransportRetryable(error);
}
