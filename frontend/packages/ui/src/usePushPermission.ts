"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PUSH_NOTIFICATION_EVENTS,
  trackPushAnalyticsEvent,
  type PushNotificationEventName,
} from "@vsolve/config";

interface OneSignalUserPushSubscription {
  id?: string | null;
  optedIn?: boolean;
  addEventListener?(event: string, listener: (event: unknown) => void): void;
  removeEventListener?(event: string, listener: (event: unknown) => void): void;
  optIn?(): Promise<void>;
  optOut?(): Promise<void>;
}

interface OneSignalUser {
  PushSubscription?: OneSignalUserPushSubscription;
  [key: string]: unknown;
}

interface OneSignalNotifications {
  permissionNative?: NotificationPermission;
  requestPermission?(): Promise<boolean>;
  [key: string]: unknown;
}

interface OneSignalSdk {
  User?: OneSignalUser;
  Notifications?: OneSignalNotifications;
  [key: string]: unknown;
}

type OneSignalDeferredItem = (OneSignal: OneSignalSdk) => void | Promise<void>;

interface WindowWithOneSignal {
  OneSignal?: OneSignalSdk;
  OneSignalDeferred?: OneSignalDeferredItem[];
}

function getWindowOneSignal(): WindowWithOneSignal | null {
  if (typeof window === "undefined") return null;
  return window as unknown as WindowWithOneSignal;
}

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

export interface UsePushPermissionOptions {
  role: "PARTNER" | "CUSTOMER";
  userId?: string | null;
  triggerEvent?: string;
  apiBaseUrl?: string;
  appId?: string;
  daysSinceSignup?: number | null;
  onSyncSuccess?: () => void;
  onSyncError?: (error: unknown) => void;
}

export interface UsePushPermissionReturn {
  permissionState: PushPermissionState;
  isPromptEligible: boolean;
  showPrePrompt: boolean;
  openPrePrompt: () => void;
  closePrePrompt: () => void;
  requestPermission: () => Promise<PushPermissionState>;
  dismissPrompt: () => void;
  syncSubscription: (action?: "sync" | "deactivate") => Promise<boolean>;
  lastDismissedAt: number | null;
  promptCount: number;
}

const PARTNER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CUSTOMER_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export const PARTNER_DISMISS_KEY = "vsh_partner_push_prompt_dismissed_at";
export const CUSTOMER_DISMISS_KEY = "vsh_customer_push_prompt_dismissed_at";

export const PARTNER_PROMPT_COUNT_KEY = "vsh_partner_push_prompt_count";
export const CUSTOMER_PROMPT_COUNT_KEY = "vsh_customer_push_prompt_count";

function getDismissKey(role: "PARTNER" | "CUSTOMER"): string {
  return role === "PARTNER" ? PARTNER_DISMISS_KEY : CUSTOMER_DISMISS_KEY;
}

function getPromptCountKey(role: "PARTNER" | "CUSTOMER"): string {
  return role === "PARTNER" ? PARTNER_PROMPT_COUNT_KEY : CUSTOMER_PROMPT_COUNT_KEY;
}

function getCooldownMs(role: "PARTNER" | "CUSTOMER"): number {
  return role === "PARTNER" ? PARTNER_COOLDOWN_MS : CUSTOMER_COOLDOWN_MS;
}

function getSyncEndpoint(role: "PARTNER" | "CUSTOMER"): string {
  return role === "PARTNER"
    ? "/api/v1/partner/push-subscriptions/sync/"
    : "/api/v1/customer/push-subscriptions/sync/";
}

function readStoredNumber(key: string): number | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const val = parseInt(raw, 10);
    return isNaN(val) ? null : val;
  } catch {
    return null;
  }
}

function writeStoredNumber(key: string, value: number): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore quota
  }
}

let cachedCsrfToken: string | null = null;

async function fetchCsrfToken(baseUrl: string): Promise<string | null> {
  if (cachedCsrfToken) return cachedCsrfToken;

  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (match?.[1]) {
      cachedCsrfToken = match[1];
      return cachedCsrfToken;
    }
  }

  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/csrf/`, {
      method: "GET",
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.csrf_token) {
        cachedCsrfToken = data.csrf_token;
        return cachedCsrfToken;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function usePushPermission({
  role,
  userId = null,
  triggerEvent = "manual",
  apiBaseUrl = "",
  appId = "",
  daysSinceSignup = null,
  onSyncSuccess,
  onSyncError,
}: UsePushPermissionOptions): UsePushPermissionReturn {
  const dismissKey = getDismissKey(role);
  const promptCountKey = getPromptCountKey(role);
  const cooldownMs = getCooldownMs(role);

  const [permissionState, setPermissionState] = useState<PushPermissionState>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission as PushPermissionState;
  });

  const [lastDismissedAt, setLastDismissedAt] = useState<number | null>(() =>
    readStoredNumber(dismissKey),
  );

  const [promptCount, setPromptCount] = useState<number>(() =>
    readStoredNumber(promptCountKey) || 0,
  );

  const [showPrePrompt, setShowPrePrompt] = useState(false);
  const unsupportedEmittedRef = useRef(false);

  // Common analytics property builder
  const buildAnalyticsPayload = useCallback(
    (syncStatus?: string) => ({
      user_id: userId,
      role,
      platform: "web",
      permission_state: permissionState,
      trigger_event: triggerEvent,
      prompt_count: promptCount,
      days_since_signup: daysSinceSignup,
      subscription_sync_status: syncStatus,
      app_id_present: Boolean(appId),
    }),
    [userId, role, permissionState, triggerEvent, promptCount, daysSinceSignup, appId],
  );

  // Determine prompt eligibility: must be 'default', supported, and not in cooldown
  const now = Date.now();
  const isInCooldown =
    lastDismissedAt !== null && now - lastDismissedAt < cooldownMs;

  const isPromptEligible =
    permissionState === "default" && !isInCooldown;

  // Track unsupported browser once
  useEffect(() => {
    if (permissionState === "unsupported" && !unsupportedEmittedRef.current) {
      unsupportedEmittedRef.current = true;
      const eventName =
        role === "PARTNER"
          ? PUSH_NOTIFICATION_EVENTS.partnerUnsupported
          : PUSH_NOTIFICATION_EVENTS.customerUnsupported;
      trackPushAnalyticsEvent(eventName, buildAnalyticsPayload());
    }
  }, [permissionState, role, buildAnalyticsPayload]);

  // Sync browser & OneSignal permission status
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      setPermissionState("unsupported");
      return;
    }

    setPermissionState(Notification.permission as PushPermissionState);

    // Watch for native permission change if supported
    if ("permissions" in navigator && typeof navigator.permissions.query === "function") {
      try {
        navigator.permissions
          .query({ name: "notifications" as PermissionName })
          .then((status) => {
            status.onchange = () => {
              const current = Notification.permission as PushPermissionState;
              setPermissionState(current);
            };
          })
          .catch(() => {});
      } catch {
        // ignore
      }
    }

    // Sync from OneSignal SDK when available
    const win = getWindowOneSignal();
    if (win?.OneSignalDeferred) {
      win.OneSignalDeferred.push((OneSignal) => {
        if (OneSignal.Notifications?.permissionNative) {
          setPermissionState(OneSignal.Notifications.permissionNative as PushPermissionState);
        }

        // Listen for subscription changes
        if (OneSignal.User?.PushSubscription?.addEventListener) {
          OneSignal.User.PushSubscription.addEventListener("change", () => {
            const current = (Notification.permission || "default") as PushPermissionState;
            setPermissionState(current);
          });
        }
      });
    }
  }, []);

  const openPrePrompt = useCallback(() => {
    setShowPrePrompt(true);
    const eventName =
      role === "PARTNER"
        ? PUSH_NOTIFICATION_EVENTS.partnerPromptViewed
        : PUSH_NOTIFICATION_EVENTS.customerPromptViewed;
    trackPushAnalyticsEvent(eventName, buildAnalyticsPayload());
  }, [role, buildAnalyticsPayload]);

  const closePrePrompt = useCallback(() => {
    setShowPrePrompt(false);
  }, []);

  const dismissPrompt = useCallback(() => {
    const timestamp = Date.now();
    setLastDismissedAt(timestamp);
    writeStoredNumber(dismissKey, timestamp);

    const nextCount = promptCount + 1;
    setPromptCount(nextCount);
    writeStoredNumber(promptCountKey, nextCount);

    setShowPrePrompt(false);

    const eventName =
      role === "PARTNER"
        ? PUSH_NOTIFICATION_EVENTS.partnerPromptDismissed
        : PUSH_NOTIFICATION_EVENTS.customerPromptDismissed;
    trackPushAnalyticsEvent(
      eventName,
      buildAnalyticsPayload(),
    );
  }, [dismissKey, promptCountKey, promptCount, role, buildAnalyticsPayload]);

  const syncSubscription = useCallback(
    async (action: "sync" | "deactivate" = "sync"): Promise<boolean> => {
      if (typeof window === "undefined") return false;

      const getSubData = () => {
        const win = getWindowOneSignal();
        const sub = win?.OneSignal?.User?.PushSubscription;
        return {
          id: sub?.id || null,
          optedIn: Boolean(sub?.optedIn),
        };
      };

      let { id: subId, optedIn } = getSubData();

      // If opting in/syncing, wait briefly (up to 3s) for OneSignal to generate the subscription ID
      if (!subId && action === "sync") {
        for (let i = 0; i < 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          const current = getSubData();
          if (current.id) {
            subId = current.id;
            optedIn = current.optedIn;
            break;
          }
        }
      }

      if (!subId) return false;

      const endpoint = getSyncEndpoint(role);
      const url = `${apiBaseUrl.replace(/\/+$/, "")}${endpoint}`;
      const perm =
        typeof Notification !== "undefined" ? Notification.permission : "default";

      const payload = {
        subscription_id: subId,
        is_active: action === "deactivate" ? false : optedIn,
        opted_in: action === "deactivate" ? false : optedIn,
        permission_state: perm,
        action,
      };

      const sendReq = async (csrf: string | null): Promise<Response> => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (csrf) {
          headers["X-CSRFToken"] = csrf;
        }
        return fetch(url, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(payload),
        });
      };

      try {
        let csrf = await fetchCsrfToken(apiBaseUrl);
        let res = await sendReq(csrf);

        if (res.status === 403) {
          // Refresh CSRF once and retry
          cachedCsrfToken = null;
          csrf = await fetchCsrfToken(apiBaseUrl);
          res = await sendReq(csrf);
        }

        if (res.ok) {
          const syncEvent =
            role === "PARTNER"
              ? PUSH_NOTIFICATION_EVENTS.partnerSubscriptionSynced
              : PUSH_NOTIFICATION_EVENTS.customerSubscriptionSynced;
          trackPushAnalyticsEvent(syncEvent, buildAnalyticsPayload("success"));
          onSyncSuccess?.();
          return true;
        } else {
          const failEvent =
            role === "PARTNER"
              ? PUSH_NOTIFICATION_EVENTS.partnerSubscriptionSyncFailed
              : PUSH_NOTIFICATION_EVENTS.customerSubscriptionSyncFailed;
          trackPushAnalyticsEvent(failEvent, buildAnalyticsPayload(`failed_${res.status}`));
          onSyncError?.(new Error(`Sync failed with status ${res.status}`));
          return false;
        }
      } catch (err) {
        const failEvent =
          role === "PARTNER"
            ? PUSH_NOTIFICATION_EVENTS.partnerSubscriptionSyncFailed
            : PUSH_NOTIFICATION_EVENTS.customerSubscriptionSyncFailed;
        trackPushAnalyticsEvent(failEvent, buildAnalyticsPayload("network_error"));
        onSyncError?.(err);
        return false;
      }
    },
    [role, apiBaseUrl, buildAnalyticsPayload, onSyncSuccess, onSyncError],
  );

  const requestPermission = useCallback(async (): Promise<PushPermissionState> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermissionState("unsupported");
      return "unsupported";
    }

    // 1. Emit explicit permission requested analytics BEFORE native prompt
    const reqEvent =
      role === "PARTNER"
        ? PUSH_NOTIFICATION_EVENTS.partnerPermissionRequested
        : PUSH_NOTIFICATION_EVENTS.customerPermissionRequested;
    trackPushAnalyticsEvent(reqEvent, buildAnalyticsPayload());

    let finalPermission: PushPermissionState = "default";

    try {
      // 2. Request native browser permission directly under active user gesture
      if (Notification.permission === "default") {
        const result = await Notification.requestPermission();
        finalPermission = result as PushPermissionState;
      } else {
        finalPermission = Notification.permission as PushPermissionState;
      }

      // 3. If granted, notify OneSignal SDK with a 2s timeout safeguard so SDK issues never hang
      if (finalPermission === "granted") {
        const win = getWindowOneSignal();
        try {
          await Promise.race([
            new Promise<void>((resolve) => {
              if (win?.OneSignal?.User?.PushSubscription?.optIn) {
                win.OneSignal.User.PushSubscription.optIn().then(() => resolve(), () => resolve());
              } else if (win?.OneSignal?.Notifications?.requestPermission) {
                win.OneSignal.Notifications.requestPermission().then(() => resolve(), () => resolve());
              } else if (win?.OneSignalDeferred) {
                win.OneSignalDeferred.push((OneSignal) => {
                  try {
                    OneSignal.User?.PushSubscription?.optIn?.()?.catch?.(() => {});
                  } catch {
                    // ignore
                  }
                  resolve();
                });
              } else {
                resolve();
              }
            }),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch {
          // OneSignal opt-in error must never block the native flow
        }
      }
    } catch {
      finalPermission = (Notification.permission || "default") as PushPermissionState;
    }

    setPermissionState(finalPermission);

    if (finalPermission === "granted") {
      // Clear dismissal cooldown on successful grant
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.removeItem(dismissKey);
        } catch {
          // ignore
        }
      }
      setLastDismissedAt(null);

      const grantEvent =
        role === "PARTNER"
          ? PUSH_NOTIFICATION_EVENTS.partnerPermissionGranted
          : PUSH_NOTIFICATION_EVENTS.customerPermissionGranted;
      trackPushAnalyticsEvent(grantEvent, buildAnalyticsPayload());
      setShowPrePrompt(false);
      // Immediately sync active subscription
      void syncSubscription("sync");
    } else if (finalPermission === "denied") {
      const denyEvent =
        role === "PARTNER"
          ? PUSH_NOTIFICATION_EVENTS.partnerPermissionDenied
          : PUSH_NOTIFICATION_EVENTS.customerPermissionDenied;
      trackPushAnalyticsEvent(denyEvent, buildAnalyticsPayload());
      // Prompt remains closed; recovery state can be surfaced
      setShowPrePrompt(false);
    }

    return finalPermission;
  }, [role, dismissKey, buildAnalyticsPayload, syncSubscription]);

  return {
    permissionState,
    isPromptEligible,
    showPrePrompt,
    openPrePrompt,
    closePrePrompt,
    requestPermission,
    dismissPrompt,
    syncSubscription,
    lastDismissedAt,
    promptCount,
  };
}

