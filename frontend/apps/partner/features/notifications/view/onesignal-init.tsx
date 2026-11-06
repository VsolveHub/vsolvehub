"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { ApiRequestError, request } from "@vsolve/api-client";
import { useCurrentSession } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";

// This site's own OneSignal app only; there is no shared App ID to fall back to.
const PARTNER_ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_PARTNER_APP_ID ?? "";

const QUEUE_STORAGE_KEY = "vsh_pending_partner_push_sync";
const MAX_ATTEMPTS = 10;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PendingPartnerPushSync {
  subscriptionId: string;
  isActive: boolean;
  optedIn: boolean;
  permissionState: string;
  action: "sync" | "deactivate";
  userId?: string | null;
  attempts: number;
  lastAttemptAt: number;
  nextAttemptAt: number;
  firstAttemptAt: number;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Exponential backoff: 30s, 2m, 10m, 1h */
function getBackoffDelayMs(attempt: number): number {
  if (attempt <= 1) return 30 * 1000;
  if (attempt === 2) return 2 * 60 * 1000;
  if (attempt === 3) return 10 * 60 * 1000;
  return 60 * 60 * 1000;
}

function loadPendingSync(): PendingPartnerPushSync | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const item = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    return item ? (JSON.parse(item) as PendingPartnerPushSync) : null;
  } catch {
    return null;
  }
}

function savePendingSync(item: PendingPartnerPushSync | null): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (!item) {
      window.localStorage.removeItem(QUEUE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(item));
    }
  } catch {
    // Storage can be blocked (private mode); the sync still runs, it just will not be retried.
  }
}

/**
 * Sends one subscription state to Django through the app's own API client, which carries the
 * session and the CSRF token. A refusal (signed out, not this account, bad payload) is dropped;
 * a rate limit, a server error or no connection is retried with backoff.
 */
async function executePushSubscriptionSync(item: PendingPartnerPushSync): Promise<boolean> {
  const { subscriptionId, isActive, optedIn, permissionState, action } = item;
  if (!subscriptionId) {
    savePendingSync(null);
    return true;
  }

  try {
    await request(() =>
      getApiClient().POST("/api/v1/partner/push-subscriptions/sync/", {
        body: {
          onesignal_subscription_id: subscriptionId,
          platform: "WEB",
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          is_active: action === "deactivate" ? false : isActive,
          opted_in: action === "deactivate" ? false : optedIn,
          permission_state: (permissionState ||
            (typeof Notification !== "undefined" ? Notification.permission : "")) as
            | ""
            | "granted"
            | "denied"
            | "default",
          action,
        },
      }),
    );
    lastAccepted = { signature: syncSignature(item), at: Date.now() };
    savePendingSync(null);
    return true;
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : null;
    if (status !== null && status !== 429 && status < 500) {
      console.warn("[OneSignal] Subscription sync refused; not retrying.", { status });
      savePendingSync(null);
      return false;
    }
    scheduleRetry(item);
    return false;
  }
}

function scheduleRetry(item: PendingPartnerPushSync): void {
  const now = Date.now();
  if (item.attempts >= MAX_ATTEMPTS || now - item.firstAttemptAt > MAX_QUEUE_AGE_MS) {
    console.warn("[OneSignal] Subscription sync gave up after repeated failures.");
    savePendingSync(null);
    return;
  }

  const nextAttempts = item.attempts + 1;
  const delayMs = getBackoffDelayMs(nextAttempts);
  const updatedItem: PendingPartnerPushSync = {
    ...item,
    attempts: nextAttempts,
    lastAttemptAt: now,
    nextAttemptAt: now + delayMs,
  };
  savePendingSync(updatedItem);

  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    void processPendingSyncQueue();
  }, delayMs);
}

async function processPendingSyncQueue(): Promise<void> {
  const pending = loadPendingSync();
  if (!pending) return;

  const now = Date.now();
  if (now >= pending.nextAttemptAt) {
    await executePushSubscriptionSync(pending);
  } else {
    const delayMs = Math.max(0, pending.nextAttemptAt - now);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      void processPendingSyncQueue();
    }, delayMs);
  }
}

/**
 * The last state Django accepted, so a tab regaining focus does not resend it. Every focus used to
 * post the same subscription again — the repeated error in the console when the server refused it.
 * Anything that changed (a new id, a permission answer, another account) still goes at once.
 */
let lastAccepted: { signature: string; at: number } | null = null;
const RESYNC_AFTER_MS = 30 * 60 * 1000;

function syncSignature(item: {
  subscriptionId: string;
  isActive: boolean;
  optedIn: boolean;
  permissionState: string;
  action: string;
  userId?: string | null;
}): string {
  return [item.subscriptionId, item.isActive, item.optedIn, item.permissionState, item.action, item.userId ?? ""].join("|");
}

function alreadyAccepted(signature: string): boolean {
  return lastAccepted !== null && lastAccepted.signature === signature && Date.now() - lastAccepted.at < RESYNC_AFTER_MS;
}

async function syncPushSubscription(
  subscriptionId: string,
  isActive: boolean = true,
  optedIn: boolean = true,
  permissionState: string = "",
  action: "sync" | "deactivate" = "sync",
  userId: string | null = null,
): Promise<void> {
  if (!subscriptionId) return;
  const resolvedPermission =
    permissionState || (typeof Notification !== "undefined" ? Notification.permission : "");
  if (
    alreadyAccepted(
      syncSignature({ subscriptionId, isActive, optedIn, permissionState: resolvedPermission, action, userId }),
    )
  ) {
    return;
  }

  const now = Date.now();
  const existing = loadPendingSync();

  const item: PendingPartnerPushSync = {
    subscriptionId,
    isActive,
    optedIn,
    permissionState:
      permissionState ||
      (typeof Notification !== "undefined" ? Notification.permission : ""),
    action,
    userId,
    attempts: existing && existing.subscriptionId === subscriptionId ? existing.attempts : 0,
    lastAttemptAt: now,
    nextAttemptAt: now,
    firstAttemptAt:
      existing && existing.subscriptionId === subscriptionId
        ? existing.firstAttemptAt
        : now,
  };

  savePendingSync(item);
  await executePushSubscriptionSync(item);
}

/**
 * Initializes the OneSignal Web Push SDK and syncs partner identity & push subscriptions.
 *
 * ## Architecture
 * - Loads the v16 OneSignal page SDK after the page becomes interactive.
 * - Enqueues initialization through `OneSignalDeferred` so it never blocks paint.
 * - Flags `allowLocalhostAsSecureOrigin` when running on localhost / 127.0.0.1.
 * - Links the active partner user session via `OneSignal.login(userId)` so notifications
 *   and instant job offers can reach the partner's browser even when the tab is in background.
 * - Syncs `OneSignal.User.PushSubscription.id` to `/api/v1/partner/push-subscriptions/sync/`
 *   to maintain Instant dispatchability.
 * - Manages durable retry queue in `localStorage` across network drops & tab re-foregrounding.
 */
let isPartnerOneSignalInitialized = false;

export function OneSignalInit() {
  const session = useCurrentSession(getApiClient());
  const userId = session.data?.user?.id ?? null;
  const loggedInUserRef = useRef<string | null>(null);
  const activeSubscriptionIdRef = useRef<string | null>(null);

  // Background and connection sync listeners
  useEffect(() => {
    if (typeof window === "undefined") return;

    void processPendingSyncQueue();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void processPendingSyncQueue();
        if (typeof window.OneSignal !== "undefined") {
          const subId = window.OneSignal.User?.PushSubscription?.id;
          const optedIn = window.OneSignal.User?.PushSubscription?.optedIn;
          if (subId) {
            void syncPushSubscription(
              subId,
              Boolean(optedIn),
              Boolean(optedIn),
              typeof Notification !== "undefined" ? Notification.permission : "",
              "sync",
              userId,
            );
          }
        }
      }
    };

    const handleOnline = () => {
      void processPendingSyncQueue();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [userId]);

  // OneSignal Web Push SDK initialization
  useEffect(() => {
    if (typeof window === "undefined" || !PARTNER_ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");
      const isLocalEnv = process.env.NEXT_PUBLIC_APP_ENV === "local" || isLocalhost;

      try {
        await OneSignal.init({
          appId: PARTNER_ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: isLocalEnv,
          autoRegister: false,
          autoResubscribe: true,
        });
        isPartnerOneSignalInitialized = true;

        // Listen for push subscription state transitions
        try {
          OneSignal.User?.PushSubscription?.addEventListener?.("change", async () => {
            const subId = OneSignal.User?.PushSubscription?.id;
            const optedIn = OneSignal.User?.PushSubscription?.optedIn;
            if (subId) {
              activeSubscriptionIdRef.current = subId;
              await syncPushSubscription(
                subId,
                Boolean(optedIn),
                Boolean(optedIn),
                typeof Notification !== "undefined" ? Notification.permission : "",
                "sync",
                userId,
              );
            }
          });
        } catch {
          // An older SDK without the event: the visibility re-sync still covers changes.
        }

        // Check if already opted in and sync subscription
        const subId = OneSignal.User?.PushSubscription?.id;
        if (subId) {
          activeSubscriptionIdRef.current = subId;
          await syncPushSubscription(
            subId,
            Boolean(OneSignal.User?.PushSubscription?.optedIn),
            Boolean(OneSignal.User?.PushSubscription?.optedIn),
            typeof Notification !== "undefined" ? Notification.permission : "",
            "sync",
            userId,
          );
        }
      } catch (err) {
        if (err instanceof Error && err.message.toLowerCase().includes("already initialized")) {
          isPartnerOneSignalInitialized = true;
          return;
        }
        isPartnerOneSignalInitialized = false;
        // Logged everywhere: a push setup that fails silently in production is how partners
        // stop hearing about decisions without anyone noticing.
        console.warn("[OneSignal] Web push could not start:", err);
      }
    });
  }, [userId]);

  // Sync external partner id with OneSignal and sync subscription state
  useEffect(() => {
    if (typeof window === "undefined" || !PARTNER_ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    if (userId && userId !== loggedInUserRef.current) {
      loggedInUserRef.current = userId;
      window.OneSignalDeferred.push(async (OneSignal) => {
        if (!isPartnerOneSignalInitialized) return;
        try {
          await OneSignal.login(userId);
          const subId = OneSignal.User?.PushSubscription?.id;
          if (subId) {
            activeSubscriptionIdRef.current = subId;
            // The real opt-in state: a subscription can exist before permission is granted,
            // and recording it as reachable would make every send fail silently.
            const optedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
            await syncPushSubscription(
              subId,
              optedIn,
              optedIn,
              typeof Notification !== "undefined" ? Notification.permission : "",
              "sync",
              userId,
            );
          }
        } catch (err) {
          console.warn("[OneSignal] login error:", err);
        }
      });
    } else if (!userId && loggedInUserRef.current) {
      loggedInUserRef.current = null;
      window.OneSignalDeferred.push(async (OneSignal) => {
        if (!isPartnerOneSignalInitialized) return;
        try {
          const subId = activeSubscriptionIdRef.current || OneSignal.User?.PushSubscription?.id;
          if (subId) {
            await syncPushSubscription(
              subId,
              false,
              false,
              typeof Notification !== "undefined" ? Notification.permission : "",
              "deactivate",
              null,
            );
          }
          await OneSignal.logout();
        } catch (err) {
          console.warn("[OneSignal] logout error:", err);
        }
      });
    }
  }, [userId]);

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  );
}
