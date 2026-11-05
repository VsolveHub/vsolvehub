// Ported from frontend/apps/partner/features/presence/model/stored-session.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The presence session id for this install: the one place the app keeps "which session am I".
 *
 * The server is still the authority — the provider confirms a stored id with a heartbeat before
 * anything calls the Partner online — but every screen reads the id from here, through
 * `subscribeStoredSession`. The presence panel used to keep its own copy in component state, so
 * a panel that was remounted while "Go online" was in flight (the Android permission dialog
 * pauses the app) came back showing Offline until the app was restarted.
 */
export const STORAGE_KEY = "vsolve.partner.presence";

let current: string | null = null;
/** An id the server has just answered for (a fresh `online`), so it needs no second check. */
let confirmed: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeStoredSession(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function readStoredSession(): string | null {
  return current;
}

/** False until the stored id has been read back from the phone's storage after a launch. */
export function isStoredSessionHydrated(): boolean {
  return hydrated;
}

export function isConfirmedSession(sessionId: string): boolean {
  return confirmed === sessionId;
}

export function hydrateStoredSession(): void {
  void AsyncStorage.getItem(STORAGE_KEY)
    .then((value) => {
      // A session written while storage was still being read is newer than what was on disk.
      if (current === null) current = value || null;
    })
    .catch((err) => {
      console.warn("[stored-session] Failed to read presence session from storage:", err);
    })
    .finally(() => {
      hydrated = true;
      notify();
    });
}

export function writeStoredSession(sessionId: string, options: { confirmed?: boolean } = {}): void {
  current = sessionId;
  confirmed = options.confirmed ? sessionId : null;
  hydrated = true;
  notify();
  void AsyncStorage.setItem(STORAGE_KEY, sessionId).catch((err) => {
    console.warn("[stored-session] Failed to persist presence session:", err);
  });
}

export function clearStoredSession(): void {
  current = null;
  confirmed = null;
  notify();
  void AsyncStorage.removeItem(STORAGE_KEY).catch((err) => {
    console.warn("[stored-session] Failed to remove presence session:", err);
  });
}
