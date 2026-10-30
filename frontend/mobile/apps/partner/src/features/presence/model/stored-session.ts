// Ported from frontend/apps/partner/features/presence/model/stored-session.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The presence session id for this install. The server is still the authority;
 * this value only decides which heartbeat to send after a relaunch.
 */
export const STORAGE_KEY = "vsolve.partner.presence";

let current: string | null = null;
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

export function hydrateStoredSession(): void {
  void AsyncStorage.getItem(STORAGE_KEY)
    .then((value) => {
      current = value || null;
      notify();
    })
    .catch((err) => {
      console.warn("[stored-session] Failed to read presence session from storage:", err);
    });
}

export function writeStoredSession(sessionId: string): void {
  current = sessionId;
  notify();
  void AsyncStorage.setItem(STORAGE_KEY, sessionId).catch((err) => {
    console.warn("[stored-session] Failed to persist presence session:", err);
  });
}

export function clearStoredSession(): void {
  current = null;
  notify();
  void AsyncStorage.removeItem(STORAGE_KEY).catch((err) => {
    console.warn("[stored-session] Failed to remove presence session:", err);
  });
}
