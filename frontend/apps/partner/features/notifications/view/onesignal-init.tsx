"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { useCurrentSession } from "@vsolve/query";
import { browserApiBaseUrl, getApiClient } from "@/lib/api/browser";

const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_PARTNER_APP_ID ||
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
  "";

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

let cachedCsrfToken: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Exponential backoff: 30s, 2m, 10m, 1h */
function getBackoffDelayMs(attempt: number): number {
  if (attempt <= 1) return 30 * 1000;
  if (attempt === 2) return 2 * 60 * 1000;
  if (attempt === 3) return 10 * 60 * 1000;
  return 60 * 60 * 1000;
}

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
  } catch (err) {
    console.error("[OneSignal Partner] Failed to bootstrap CSRF token:", err);
  }
  return null;
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
  } catch (err) {
    console.error("[OneSignal Partner] Failed to update localStorage queue:", err);
  }
}

async function executePushSubscriptionSync(
  item: PendingPartnerPushSync,
  isCsrfRetry: boolean = false,
): Promise<boolean> {
  const { subscriptionId, isActive, optedIn, permissionState, action } = item;
  if (!subscriptionId) {
    savePendingSync(null);
    return true;
  }

  const base = browserApiBaseUrl();
  const csrf = await fetchCsrfToken(base);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (csrf) {
    headers["X-CSRFToken"] = csrf;
  }

  const payload = {
    onesignal_subscription_id: subscriptionId,
    platform: "WEB",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    is_active: action === "deactivate" ? false : Boolean(isActive),
    opted_in: action === "deactivate" ? false : Boolean(optedIn),
    permission_state: permissionState || (typeof Notification !== "undefined" ? Notification.permission : ""),
    action,
  };

  try {
    const res = await fetch(`${base}/api/v1/partner/push-subscriptions/sync/`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      savePendingSync(null);
      return true;
    }

    if (res.status === 401) {
      console.error("[OneSignal Partner] Sync rejected: unauthenticated (401)", {
        subscriptionId,
      });
      // Do not continue retrying when unauthenticated; clear queue
      savePendingSync(null);
      return false;
    }

    if (res.status === 403) {
      let isCsrfFailure = false;
      let errorCode: string | null = null;
      try {
        const body = await res.clone().json();
        errorCode = body?.error?.code ?? body?.code ?? null;
        if (
          errorCode === "csrf_failed" ||
          String(body?.detail || "").toLowerCase().includes("csrf") ||
          String(body?.error?.message || "").toLowerCase().includes("security token")
        ) {
          isCsrfFailure = true;
        }
      } catch {
        try {
          const text = await res.clone().text();
          if (text.toLowerCase().includes("csrf")) {
            isCsrfFailure = true;
          }
        } catch {
          // ignore
        }
      }

      if (isCsrfFailure && !isCsrfRetry) {
        console.warn("[OneSignal Partner] CSRF failure detected on sync (403). Refreshing CSRF token and retrying once...", {
          subscriptionId,
        });
        cachedCsrfToken = null;
        await fetchCsrfToken(base);
        return executePushSubscriptionSync(item, true);
      }

      // Authorization / ownership failure: do not retry; log and discard queued sync
      console.error("[OneSignal Partner] Authorization/ownership failure (403): sync discarded", {
        subscriptionId,
        errorCode: errorCode || "forbidden",
        isCsrfFailure,
      });
      savePendingSync(null);
      return false;
    }

    if (res.status === 400) {
      console.error("[OneSignal Partner] Sync rejected: invalid payload (400)", {
        subscriptionId,
      });
      savePendingSync(null);
      return false;
    }

    if (res.status === 409) {
      console.error("[OneSignal Partner] Sync rejected: subscription state conflict (409)", {
        subscriptionId,
      });
      savePendingSync(null);
      return false;
    }

    // 429 Rate Limit or 5xx Server Error: retryable
    console.error(`[OneSignal Partner] Push subscription backend error (${res.status}):`, {
      subscriptionId,
      status: res.status,
    });
    scheduleRetry(item);
    return false;
  } catch (netErr) {
    // Network failure / offline: retryable
    console.error("[OneSignal Partner] Push subscription backend network error:", netErr);
    scheduleRetry(item);
    return false;
  }
}

function scheduleRetry(item: PendingPartnerPushSync): void {
  const now = Date.now();
  if (item.attempts >= MAX_ATTEMPTS || now - item.firstAttemptAt > MAX_QUEUE_AGE_MS) {
    console.error(
      "[OneSignal Partner] Sync dropped: exceeded max retry attempts (10) or max age (24h)",
      {
        subscriptionId: item.subscriptionId,
        attempts: item.attempts,
        ageMs: now - item.firstAttemptAt,
      },
    );
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

async function syncPushSubscription(
  subscriptionId: string,
  isActive: boolean = true,
  optedIn: boolean = true,
  permissionState: string = "",
  action: "sync" | "deactivate" = "sync",
  userId: string | null = null,
): Promise<void> {
  if (!subscriptionId) return;

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
    if (typeof window === "undefined" || !ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");
      const isLocalEnv = process.env.NEXT_PUBLIC_APP_ENV === "local" || isLocalhost;

      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
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
        } catch (listenerErr) {
          console.warn("[OneSignal] Push subscription listener error:", listenerErr);
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
        if (process.env.NODE_ENV === "development") {
          const isOriginMismatch = err instanceof Error && err.message.includes("Can only be used on");
          if (isOriginMismatch) {
            console.info(
              `[OneSignal Partner] Web push is inactive on ${window.location.hostname} (OneSignal app is configured for production domain only).`,
            );
          } else {
            console.warn("[OneSignal] init warning:", err);
          }
        }
      }
    });
  }, [userId]);

  // Sync external partner id with OneSignal and sync subscription state
  useEffect(() => {
    if (typeof window === "undefined" || !ONESIGNAL_APP_ID) return;

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
            await syncPushSubscription(
              subId,
              true,
              true,
              typeof Notification !== "undefined" ? Notification.permission : "granted",
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
