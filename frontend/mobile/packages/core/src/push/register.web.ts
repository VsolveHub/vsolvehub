import { kvGet, kvRemove } from "../storage/kv";
import type { AppKind } from "../config";

/** The browser has no device push token. */
export async function readRegisteredPushToken(): Promise<string | null> {
  return kvGet("expo-push-token");
}

/** Push registration is a phone-only step. */
export async function registerForPush(_options?: { appKind?: AppKind }): Promise<string | null> {
  return null;
}

export async function unregisterPush(): Promise<void> {
  await kvRemove("expo-push-token");
}
