"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { useCustomerSession } from "@/features/session/queries";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

// This site's own OneSignal app only; there is no shared App ID to fall back to.
const CUSTOMER_ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_CUSTOMER_APP_ID ?? "";

const ONESIGNAL_SAFARI_WEB_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "";

const QUEUE_STORAGE_KEY = "vsh_pending_customer_push_sync";
const MAX_ATTEMPTS = 10;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PendingCustomerPushSync {
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
    console.error("[OneSignal Customer] Failed to bootstrap CSRF token:", err);
  }
  return null;
}

function loadPendingSync(): PendingCustomerPushSync | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const item = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    return item ? (JSON.parse(item) as PendingCustomerPushSync) : null;
  } catch {
    return null;
  }
}

function savePendingSync(item: PendingCustomerPushSync | null): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (!item) {
      window.localStorage.removeItem(QUEUE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(item));
    }
  } catch (err) {
    console.error("[OneSignal Customer] Failed to update localStorage queue:", err);
  }
}

async function executePushSubscriptionSync(
  item: PendingCustomerPushSync,
  isCsrfRetry: boolean = false,
): Promise<boolean> {
  const { subscriptionId, isActive, optedIn, permissionState, action } = item;
  if (!subscriptionId) {
    savePendingSync(null);
    return true;
  }

  const base = PUBLIC_API_BASE_URL;
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
    permission_state:
      permissionState ||
      (typeof Notification !== "undefined" ? Notification.permission : ""),
    action,
  };

  try {
    const res = await fetch(`${base}/api/v1/customer/push-subscriptions/sync/`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      lastAccepted = { signature: syncSignature(item), at: Date.now() };
      savePendingSync(null);
      return true;
    }

    if (res.status === 401) {
      console.error("[OneSignal Customer] Sync rejected: unauthenticated (401)", {
        subscriptionId,
      });
      // Do not retry when unauthenticated; clear queue
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
        console.warn(
          "[OneSignal Customer] CSRF failure detected on sync (403). Refreshing CSRF token and retrying once...",
          { subscriptionId },
        );
        cachedCsrfToken = null;
        await fetchCsrfToken(base);
        return executePushSubscriptionSync(item, true);
      }

      // Authorization / ownership failure: do not retry; log and discard queued sync
      console.error(
        "[OneSignal Customer] Authorization/ownership failure (403): sync discarded",
        {
          subscriptionId,
          errorCode: errorCode || "forbidden",
          isCsrfFailure,
        },
      );
      savePendingSync(null);
      return false;
    }

    if (res.status === 400) {
      console.error("[OneSignal Customer] Sync rejected: invalid payload (400)", {
        subscriptionId,
      });
      savePendingSync(null);
      return false;
    }

    if (res.status === 409) {
      console.error(
        "[OneSignal Customer] Sync rejected: subscription state conflict (409)",
        { subscriptionId },
      );
      savePendingSync(null);
      return false;
    }

    // 429 Rate Limit or 5xx Server Error: retryable
    console.error(
      `[OneSignal Customer] Push subscription backend error (${res.status}):`,
      {
        subscriptionId,
        status: res.status,
      },
    );
    scheduleRetry(item);
    return false;
  } catch (netErr) {
    // Network failure / offline: retryable
    console.error("[OneSignal Customer] Push subscription backend network error:", netErr);
    scheduleRetry(item);
    return false;
  }
}

function scheduleRetry(item: PendingCustomerPushSync): void {
  const now = Date.now();
  if (item.attempts >= MAX_ATTEMPTS || now - item.firstAttemptAt > MAX_QUEUE_AGE_MS) {
    console.error(
      "[OneSignal Customer] Sync dropped: exceeded max retry attempts (10) or max age (24h)",
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
  const updatedItem: PendingCustomerPushSync = {
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

  const item: PendingCustomerPushSync = {
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
 * Initializes the OneSignal Web Push SDK and syncs customer identity & push subscriptions.
 *
 * ## Architecture
 * - Loads the v16 OneSignal page SDK after the page becomes interactive (`afterInteractive`).
 * - Enqueues initialization through `OneSignalDeferred` so it never blocks page load or paint.
 * - Flags `allowLocalhostAsSecureOrigin` when running on localhost / 127.0.0.1.
 * - Configures Apple Safari Web Push via `safari_web_id` if present.
 * - Links the active customer session via `OneSignal.login(userId)` so notifications reach
 *   the user across devices and unbinds on logout via `OneSignal.logout()`.
 * - Syncs `OneSignal.User.PushSubscription.id` to `/api/v1/customer/push-subscriptions/sync/`.
 * - Manages durable retry queue in `localStorage` across network drops & tab re-foregrounding.
 * - Does NOT prompt for notification permissions (prompting deferred to Milestone 5 checkout).
 */
let isCustomerOneSignalInitialized = false;

export function OneSignalInit() {
  const session = useCustomerSession();
  const userId = session.isAuthenticated ? session.userId : null;
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
    if (typeof window === "undefined" || !CUSTOMER_ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");

      try {
        const initConfig: Parameters<typeof OneSignal.init>[0] = {
          appId: CUSTOMER_ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: isLocalhost,
          autoRegister: false,
          autoResubscribe: true,
        };
        if (ONESIGNAL_SAFARI_WEB_ID) {
          initConfig.safari_web_id = ONESIGNAL_SAFARI_WEB_ID;
        }
        await OneSignal.init(initConfig);
        isCustomerOneSignalInitialized = true;

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
          console.warn("[OneSignal Customer] Push subscription listener error:", listenerErr);
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
          isCustomerOneSignalInitialized = true;
          return;
        }
        isCustomerOneSignalInitialized = false;
        if (process.env.NODE_ENV === "development") {
          const isOriginMismatch = err instanceof Error && err.message.includes("Can only be used on");
          if (isOriginMismatch) {
            console.info(
              `[OneSignal Customer] Web push is inactive on ${window.location.hostname} (OneSignal app is configured for production domain only).`,
            );
          } else {
            console.warn("[OneSignal Customer] init warning:", err);
          }
        }
      }
    });
  }, [userId]);

  // Sync external user id with OneSignal and sync subscription state
  useEffect(() => {
    if (typeof window === "undefined" || !CUSTOMER_ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    if (userId && userId !== loggedInUserRef.current) {
      loggedInUserRef.current = userId;
      window.OneSignalDeferred.push(async (OneSignal) => {
        if (!isCustomerOneSignalInitialized) return;
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
          console.warn("[OneSignal Customer] login error:", err);
        }
      });
    } else if (!userId && loggedInUserRef.current) {
      loggedInUserRef.current = null;
      window.OneSignalDeferred.push(async (OneSignal) => {
        if (!isCustomerOneSignalInitialized) return;
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
          console.warn("[OneSignal Customer] logout error:", err);
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
