/**
 * Idempotency keys for mutating requests.
 *
 * The backend requires a key wherever a retry could duplicate a financial or
 * operational effect: checkout conversion, payment attempts, extension and
 * parts approvals, payout requests (plan document 09 §10).
 *
 * The key must be *stable for one logical operation attempt*, not per HTTP
 * call. A fresh key on every call defeats the purpose — a double-click or a
 * refresh mid-payment would create two orders. So a key is minted once per
 * operation and reused until that operation reaches a terminal outcome.
 *
 * Keys are persisted in `sessionStorage` so a refresh, a lost payment-gateway
 * redirect, or a reconnect resumes the same attempt rather than starting a
 * second one. `sessionStorage` and not `localStorage`: a key must not leak into
 * an unrelated future tab or session.
 */

const STORAGE_PREFIX = "vsolve.idem.";

/** Generates a fresh key. Prefers the platform CSPRNG. */
export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // No CSPRNG (very old browser, or a non-browser runtime without webcrypto).
  // Throwing is correct: a guessable or colliding key on a payment mutation is
  // worse than a clear failure.
  throw new Error(
    "Cannot create an idempotency key: no cryptographic random source is available.",
  );
}

function storage(): Storage | null {
  // Server render, or a browser with storage blocked by privacy settings.
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Returns the key for a logical operation, minting and persisting one on first
 * use.
 *
 * `operationId` must identify the operation, not the attempt — for example
 * `checkout:9f2c...` or `extension:af31...`. Two different operations must never
 * share an id, and the same operation must always produce the same id.
 *
 * When storage is unavailable the key is still returned, but it cannot survive
 * a refresh. Server-side idempotency remains the real guarantee; this only
 * makes the client cooperate with it.
 */
export function getStableIdempotencyKey(operationId: string): string {
  const store = storage();
  const storageKey = `${STORAGE_PREFIX}${operationId}`;

  if (store) {
    const existing = store.getItem(storageKey);
    if (existing) return existing;
  }

  const key = createIdempotencyKey();
  try {
    store?.setItem(storageKey, key);
  } catch {
    // Quota or private-mode failure. Proceed with an in-memory key.
  }
  return key;
}

/**
 * Drops a stored key once its operation has reached an authoritative terminal
 * outcome (succeeded, failed, refunded, expired).
 *
 * Never clear a key while an outcome is still pending or unknown — that is
 * exactly when the stored key is doing its job.
 */
export function clearIdempotencyKey(operationId: string): void {
  try {
    storage()?.removeItem(`${STORAGE_PREFIX}${operationId}`);
  } catch {
    // Nothing actionable; the key will expire with the session.
  }
}

/** True when an operation already has a key in flight. */
export function hasIdempotencyKey(operationId: string): boolean {
  return storage()?.getItem(`${STORAGE_PREFIX}${operationId}`) != null;
}
