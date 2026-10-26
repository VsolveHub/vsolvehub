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

const STORAGE_CHANGE_EVENT = "vsolve:partner-presence-storage";

/** React to writes from this tab and from other tabs on the same origin. */
export function subscribeStoredSession(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const notify = () => onStoreChange();
  window.addEventListener(STORAGE_CHANGE_EVENT, notify);
  window.addEventListener("storage", notify);

  return () => {
    window.removeEventListener(STORAGE_CHANGE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

function notifyStoredSessionChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

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
    notifyStoredSessionChange();
  } catch {
    // A Partner who cannot persist this simply loses the restore on reload,
    // which is the behaviour they had before it existed.
  }
}

/**
 * The last service area a Partner picked, so switching tabs or reloading does
 * not ask them to choose it again. A UI preference, not a credential and not
 * trusted as current: `presence-panel` still only sends it to Django inside an
 * explicit "Go online" tap, which is where a stale or deactivated area is
 * actually caught.
 */
const AREA_STORAGE_KEY = "vsolve.partner.presence.area";

export function readStoredAreaId(): string | null {
  try {
    return storage()?.getItem(AREA_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function writeStoredAreaId(areaId: string): void {
  try {
    storage()?.setItem(AREA_STORAGE_KEY, areaId);
  } catch {
    // A Partner who cannot persist this simply re-picks their area next time.
  }
}

export function clearStoredSession(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
    notifyStoredSessionChange();
  } catch {
    // Nothing to recover: the next probe fails and clears the screen anyway.
  }
}
