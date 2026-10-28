     "use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { useCurrentSession } from "@vsolve/query";
import { browserApiBaseUrl, getApiClient } from "@/lib/api/browser";

const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "a4b12340-473f-4349-a874-bd4d1128688e";

async function syncPushSubscription(subscriptionId: string, isActive: boolean = true) {
  if (!subscriptionId) return;
  try {
    const base = browserApiBaseUrl();
    await fetch(`${base}/api/v1/partner/push-subscriptions/sync/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        onesignal_subscription_id: subscriptionId,
        platform: "WEB",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        is_active: isActive,
      }),
    });
  } catch (err) {
    console.warn("[OneSignal] Push subscription backend sync error:", err);
  }
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
 */
export function OneSignalInit() {
  const session = useCurrentSession(getApiClient());
  const userId = session.data?.user?.id ?? null;
  const loggedInUserRef = useRef<string | null>(null);
  const activeSubscriptionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      const isLocalEnv = process.env.NEXT_PUBLIC_APP_ENV === "local";

      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: isLocalEnv,
        });

        // Listen for push subscription state transitions
        try {
          OneSignal.User?.PushSubscription?.addEventListener?.("change", async (event: any) => {
            const subId = OneSignal.User?.PushSubscription?.id;
            const optedIn = OneSignal.User?.PushSubscription?.optedIn;
            if (subId) {
              activeSubscriptionIdRef.current = subId;
              await syncPushSubscription(subId, Boolean(optedIn));
            }
          });
        } catch (listenerErr) {
          console.warn("[OneSignal] Push subscription listener error:", listenerErr);
        }

        // Check if already opted in and sync subscription
        const subId = OneSignal.User?.PushSubscription?.id;
        if (subId) {
          activeSubscriptionIdRef.current = subId;
          await syncPushSubscription(subId, Boolean(OneSignal.User?.PushSubscription?.optedIn));
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[OneSignal] init warning:", err);
        }
      }
    });
  }, []);

  // Sync external partner id with OneSignal and sync subscription state
  useEffect(() => {
    if (typeof window === "undefined" || !ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    if (userId && userId !== loggedInUserRef.current) {
      loggedInUserRef.current = userId;
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.login(userId);
          const subId = OneSignal.User?.PushSubscription?.id;
          if (subId) {
            activeSubscriptionIdRef.current = subId;
            await syncPushSubscription(subId, true);
          }
        } catch (err) {
          console.warn("[OneSignal] login error:", err);
        }
      });
    } else if (!userId && loggedInUserRef.current) {
      loggedInUserRef.current = null;
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          const subId = activeSubscriptionIdRef.current || OneSignal.User?.PushSubscription?.id;
          if (subId) {
            await syncPushSubscription(subId, false);
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
