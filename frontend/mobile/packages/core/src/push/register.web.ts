import { kvGet, kvRemove } from "../storage/kv";
import type { AppKind } from "../config";

/** The browser has no device push token. */
export async function readRegisteredPushToken(): Promise<string | null> {
  return kvGet("expo-push-token");
}

/** Push registration is a phone-only step. */
export async function registerForPush(_options?: { appKind?: AppKind }): Promise<string | null> {
  if (typeof console !== "undefined" && console.info) {
    console.info(
      "[Push] Web browser mode. Expo native push tokens require a physical device or emulator. Web portals use OneSignal Web Push."
    );
  }
  return null;
}

export async function unregisterPush(): Promise<void> {
  await kvRemove("expo-push-token");
}

export function isPushSupported(): boolean {
  return false;
}
