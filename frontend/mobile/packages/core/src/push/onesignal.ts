import { request } from "@vsolve/api-client";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

import { getApiClient } from "../api/client";
import { appKind, type AppKind } from "../config";

/**
 * Push notifications through OneSignal, the same channel as the web.
 *
 * Each app is a OneSignal subscriber of its own OneSignal app (`EXPO_PUBLIC_ONESIGNAL_PARTNER_APP_ID`
 * or `EXPO_PUBLIC_ONESIGNAL_CUSTOMER_APP_ID`: the same apps their websites use; there is no shared
 * App ID) and signs in with the
 * user's id, exactly as the web does with `OneSignal.login(userId)`. One send from Django then
 * reaches every device the person uses. The subscription is also reported to Django
 * (`/push-subscriptions/sync/`), which only pushes to people with a verified subscription.
 */

type OneSignalPackage = typeof import("react-native-onesignal");
type OSNotification = InstanceType<OneSignalPackage["OSNotification"]>;

/** What the person has said about notifications on this phone. */
export type PushPermission = "granted" | "denied" | "undetermined" | "unavailable";

/** A notification's own data (Django's `data`), plus its link as `url`. */
export type PushPayload = Record<string, unknown>;

let pkg: OneSignalPackage | null | undefined;
let started = false;
let linkedKind: AppKind | null = null;

/**
 * `react-native-onesignal`, loaded on first use, or `null` where it cannot run: Expo Go and the
 * browser have no OneSignal native module, and importing it there throws.
 */
function oneSignalPackage(): OneSignalPackage | null {
  if (pkg !== undefined) return pkg;
  if (Platform.OS === "web" || isRunningInExpoGo()) {
    pkg = null;
    return pkg;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pkg = require("react-native-onesignal") as OneSignalPackage;
  } catch {
    pkg = null;
  }
  return pkg;
}

function ready(): OneSignalPackage | null {
  return started ? oneSignalPackage() : null;
}

/** Starts OneSignal once, at app start. Without an App ID (Expo Go, local web) it does nothing. */
export function startPush(): void {
  if (started) return;
  const mod = oneSignalPackage();
  // Each app's own OneSignal app, never a shared one. Both are read statically so Expo inlines them.
  const appId = (
    appKind() === "partner"
      ? process.env.EXPO_PUBLIC_ONESIGNAL_PARTNER_APP_ID
      : process.env.EXPO_PUBLIC_ONESIGNAL_CUSTOMER_APP_ID
  )?.trim();
  if (mod === null || !appId) return;
  try {
    mod.OneSignal.initialize(appId);
    started = true;
    // The subscription id arrives (or changes) after start; report it whenever a user is linked.
    mod.OneSignal.User.pushSubscription.addEventListener("change", () => {
      if (linkedKind !== null) void reportSubscription(linkedKind, "sync");
    });
  } catch {
    started = false;
  }
}

/** Whether this build can receive push at all (a real phone build with OneSignal started). */
export function isPushSupported(): boolean {
  return ready() !== null;
}

export async function pushPermission(): Promise<PushPermission> {
  const mod = ready();
  if (mod === null) return "unavailable";
  try {
    if (await mod.OneSignal.Notifications.getPermissionAsync()) return "granted";
    return (await mod.OneSignal.Notifications.canRequestPermission()) ? "undetermined" : "denied";
  } catch {
    return "unavailable";
  }
}

/**
 * After sign-in (and at every start while signed in): links this phone to the person, asks for
 * permission if they have never answered, and reports the subscription to Django.
 */
export async function linkPushUser(options?: { appKind?: AppKind }): Promise<PushPermission> {
  const mod = ready();
  if (mod === null) return "unavailable";
  const kind = options?.appKind ?? appKind();
  try {
    const session = await request(() => getApiClient().GET("/api/v1/auth/session/"));
    const userId = session.user?.id;
    if (!userId) return pushPermission();
    mod.OneSignal.login(String(userId));
    linkedKind = kind;
    if ((await pushPermission()) === "undetermined") {
      await mod.OneSignal.Notifications.requestPermission(false);
    }
    await reportSubscription(kind, "sync");
  } catch {
    // Push is best effort: a failed link must never block the app. The next start retries.
  }
  return pushPermission();
}

/**
 * The "turn notifications on" button: asks again, or opens the phone's settings when the person
 * said no before (Android and iOS only let an app ask once).
 */
export async function enablePush(): Promise<PushPermission> {
  const mod = ready();
  if (mod === null) return "unavailable";
  try {
    await mod.OneSignal.Notifications.requestPermission(true);
    mod.OneSignal.User.pushSubscription.optIn();
    if (linkedKind !== null) await reportSubscription(linkedKind, "sync");
  } catch {
    // The permission below says what happened.
  }
  return pushPermission();
}

/** On sign-out, before the session ends: tell Django this phone is gone, then unlink it. */
export async function unlinkPushUser(): Promise<void> {
  const mod = ready();
  if (mod === null) return;
  const kind = linkedKind ?? appKind();
  try {
    await reportSubscription(kind, "deactivate");
  } catch {
    // Sign-out must not be trapped by a push call.
  }
  try {
    mod.OneSignal.logout();
  } catch {
    // Nothing to unlink.
  }
  linkedKind = null;
}

/** What the diagnostics screen shows about this phone's push setup. */
export async function pushStatus(): Promise<{
  supported: boolean;
  permission: PushPermission;
  subscriptionId: string | null;
  optedIn: boolean;
}> {
  const mod = ready();
  if (mod === null) return { supported: false, permission: "unavailable", subscriptionId: null, optedIn: false };
  const [permission, subscriptionId, optedIn] = await Promise.all([
    pushPermission(),
    mod.OneSignal.User.pushSubscription.getIdAsync().catch(() => null),
    mod.OneSignal.User.pushSubscription.getOptedInAsync().catch(() => false),
  ]);
  return { supported: true, permission, subscriptionId: realId(subscriptionId), optedIn };
}

/** Calls `handler` with a notification's data when the person taps it (also from a cold start). */
export function onPushTap(handler: (data: PushPayload) => void): () => void {
  const mod = ready();
  if (mod === null) return () => {};
  const listener = (event: { notification: OSNotification }) => handler(payloadOf(event.notification));
  mod.OneSignal.Notifications.addEventListener("click", listener);
  return () => mod.OneSignal.Notifications.removeEventListener("click", listener);
}

/** Calls `handler` when a notification arrives while the app is open. It still shows as usual. */
export function onPushReceived(handler: (data: PushPayload) => void): () => void {
  const mod = ready();
  if (mod === null) return () => {};
  const listener = (event: { getNotification(): OSNotification }) => handler(payloadOf(event.getNotification()));
  mod.OneSignal.Notifications.addEventListener("foregroundWillDisplay", listener);
  return () => mod.OneSignal.Notifications.removeEventListener("foregroundWillDisplay", listener);
}

function payloadOf(notification: OSNotification): PushPayload {
  const data: PushPayload = { ...((notification.additionalData as PushPayload | undefined) ?? {}) };
  if (typeof data.url !== "string" && notification.launchURL) data.url = notification.launchURL;
  return data;
}

/** A server-assigned subscription id; OneSignal's `local-` placeholder is not one yet. */
function realId(id: string | null | undefined): string | null {
  return id && !id.startsWith("local-") ? id : null;
}

async function reportSubscription(kind: AppKind, action: "sync" | "deactivate"): Promise<void> {
  const mod = ready();
  if (mod === null) return;
  const id = realId(await mod.OneSignal.User.pushSubscription.getIdAsync());
  if (id === null) return;
  const permission = await pushPermission();
  const optedIn = await mod.OneSignal.User.pushSubscription.getOptedInAsync();
  const body = {
    onesignal_subscription_id: id,
    platform: Platform.OS === "ios" ? ("IOS" as const) : ("ANDROID" as const),
    user_agent: `vsolve-${kind}-app/${Constants.expoConfig?.version ?? "1.0.0"} (${Platform.OS} ${String(Platform.Version)})`,
    is_active: action === "sync",
    opted_in: action === "sync" && optedIn,
    permission_state:
      permission === "granted" ? ("granted" as const) : permission === "denied" ? ("denied" as const) : ("default" as const),
    action,
  };
  if (kind === "partner") {
    await request(() => getApiClient().POST("/api/v1/partner/push-subscriptions/sync/", { body }));
  } else {
    await request(() => getApiClient().POST("/api/v1/customer/push-subscriptions/sync/", { body }));
  }
}
