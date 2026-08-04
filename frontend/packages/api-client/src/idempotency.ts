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
 *
 * ## When storage refuses
 *
 * Private mode, a full quota and hardened privacy settings all make
 * `sessionStorage` throw — and they do it on `setItem`, after `getItem` has
 * already answered `null`. Without a fallback that combination mints a *fresh
 * key on every call*, which is the one behaviour this module exists to prevent:
 * a double-clicked payment becomes two payments precisely for the users whose
 * browser is most locked down. So a browser-only in-memory map backs storage up.
 * It cannot survive a refresh — nothing can, once storage is refusing writes —
 * but it makes same-page replay stable, which is where duplicate submits
 * actually come from.
 */

const STORAGE_PREFIX = "vsolve.idem.";

/**
 * Fallback for keys `sessionStorage` refused to hold.
 *
 * Browser-only, and the guard is not defensive tidiness. This module is
 * imported by server components, where module scope lives for the life of the
 * process and is shared by every concurrent request — a map populated there
 * would hand one customer's checkout key to the next customer's checkout. On
 * the server there is no persistence at all, and that is the correct answer:
 * a server render has no attempt to resume.
 *
 * Storage stays authoritative whenever it works, so this map holds only the
 * keys storage rejected. That keeps one key per operation rather than two
 * layers that can disagree.
 */
const memoryKeys = new Map<string, string>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

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
  if (!isBrowser()) return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reads a key from storage, falling back to the keys storage would not hold.
 *
 * `getItem` is wrapped too: some hardened environments expose the object and
 * throw on access, and an exception here must not surface as a failed payment.
 */
function readKey(storageKey: string): string | null {
  const store = storage();
  if (store) {
    try {
      const stored = store.getItem(storageKey);
      if (stored) return stored;
    } catch {
      // Fall through to the in-memory fallback.
    }
  }
  return isBrowser() ? (memoryKeys.get(storageKey) ?? null) : null;
}

/** Persists a key, keeping it in memory only when storage refused it. */
function writeKey(storageKey: string, key: string): void {
  const store = storage();
  if (store) {
    try {
      store.setItem(storageKey, key);
      return;
    } catch {
      // Quota or private-mode failure — the memory fallback below is the point.
    }
  }
  if (isBrowser()) memoryKeys.set(storageKey, key);
}

/**
 * Returns the key for a logical operation, minting and persisting one on first
 * use.
 *
 * `operationId` must identify the operation, not the attempt — for example
 * `checkout:9f2c...` or `extension:af31...`. Two different operations must never
 * share an id, and the same operation must always produce the same id.
 *
 * When storage is unavailable the key is still stable for the life of the page
 * but cannot survive a refresh. Server-side idempotency remains the real
 * guarantee; this only makes the client cooperate with it.
 */
export function getStableIdempotencyKey(operationId: string): string {
  const storageKey = `${STORAGE_PREFIX}${operationId}`;

  const existing = readKey(storageKey);
  if (existing) return existing;

  const key = createIdempotencyKey();
  writeKey(storageKey, key);
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
  const storageKey = `${STORAGE_PREFIX}${operationId}`;
  // Both layers, unconditionally. Clearing one and leaving the other is how a
  // "cleared" operation comes back with its old key on the next call.
  memoryKeys.delete(storageKey);
  try {
    storage()?.removeItem(storageKey);
  } catch {
    // Nothing actionable; the key will expire with the session.
  }
}

/** True when an operation already has a key in flight. */
export function hasIdempotencyKey(operationId: string): boolean {
  return readKey(`${STORAGE_PREFIX}${operationId}`) !== null;
}
