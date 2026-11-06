import type { AppKind } from "../config";

/**
 * The browser build of the app has no OneSignal native module. Web push belongs to the real
 * websites (frontend/apps/*), so here every call is a harmless no-op.
 */
export type PushPermission = "granted" | "denied" | "undetermined" | "unavailable";
export type PushPayload = Record<string, unknown>;

export function startPush(): void {}

export function isPushSupported(): boolean {
  return false;
}

export async function pushPermission(): Promise<PushPermission> {
  return "unavailable";
}

export async function linkPushUser(_options?: { appKind?: AppKind }): Promise<PushPermission> {
  return "unavailable";
}

export async function enablePush(): Promise<PushPermission> {
  return "unavailable";
}

export async function unlinkPushUser(): Promise<void> {}

export async function pushStatus(): Promise<{
  supported: boolean;
  permission: PushPermission;
  subscriptionId: string | null;
  optedIn: boolean;
}> {
  return { supported: false, permission: "unavailable", subscriptionId: null, optedIn: false };
}

export function onPushTap(_handler: (data: PushPayload) => void): () => void {
  return () => {};
}

export function onPushReceived(_handler: (data: PushPayload) => void): () => void {
  return () => {};
}
