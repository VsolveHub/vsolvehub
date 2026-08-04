/**
 * The one thing a reload cannot re-derive: which presence session is this
 * browser's.
 *
 * Presence itself lives on the server, and the contract publishes no way to ask
 * "am I online?" — `presence/online`, `presence/heartbeat` and
 * `presence/offline` are the whole surface. So the session id is kept here and
 * re-verified against Django with a heartbeat before the screen claims anything.
 * Nothing is trusted because it was stored; the stored value only decides which
 * question to ask.
 *
 * ## Why this is not a credential
 *
 * The id names a presence record. Every command against it is authorized by the
 * HttpOnly session cookie, which is not readable here and is not stored here —
 * possession of this value grants nothing. It is deliberately kept out of any
 * key containing the substrings the browser-storage acceptance test forbids.
 *
 * `localStorage` rather than `sessionStorage`: a Partner who closes the tab is
 * still online as far as dispatch is concerned, and showing them "offline" on
 * reopening would be the same false claim in a slower form.
 */

export const STORAGE_KEY = "vsolve.partner.presence";

/** Storage throws in private modes and when disabled; presence is not worth a crash. */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredSession(): string | null {
  try {
    return storage()?.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function writeStoredSession(sessionId: string): void {
  try {
    storage()?.setItem(STORAGE_KEY, sessionId);
  } catch {
    // A Partner who cannot persist this simply loses the restore on reload,
    // which is the behaviour they had before it existed.
  }
}

export function clearStoredSession(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover: the next probe fails and clears the screen anyway.
  }
}
