"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { useCurrentSession } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";

const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "a4b12340-473f-4349-a874-bd4d1128688e";

/**
 * Initializes the OneSignal Web Push SDK and syncs partner identity.
 *
 * ## Architecture
 * - Loads the v16 OneSignal page SDK after the page becomes interactive.
 * - Enqueues initialization through `OneSignalDeferred` so it never blocks paint.
 * - Flags `allowLocalhostAsSecureOrigin` when running on localhost / 127.0.0.1.
 * - Links the active partner user session via `OneSignal.login(userId)` so notifications
 *   and instant job offers can reach the partner's browser even when the tab is in background.
 */
export function OneSignalInit() {
  const session = useCurrentSession(getApiClient());
  const userId = session.data?.user?.id ?? null;
  const loggedInUserRef = useRef<string | null>(null);

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

        // If notification permission is already granted in the browser, ensure OneSignal push subscription is opted in
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            if (OneSignal.User?.PushSubscription && !OneSignal.User.PushSubscription.optedIn) {
              await OneSignal.User.PushSubscription.optIn();
            }
          } catch (optInErr) {
            console.warn("[OneSignal] auto optIn error:", optInErr);
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[OneSignal] init warning:", err);
        }
      }
    });
  }, []);

  // Sync external partner id with OneSignal
  useEffect(() => {
    if (typeof window === "undefined" || !ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    if (userId && userId !== loggedInUserRef.current) {
      loggedInUserRef.current = userId;
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.login(userId);
        } catch (err) {
          console.warn("[OneSignal] login error:", err);
        }
      });
    } else if (!userId && loggedInUserRef.current) {
      loggedInUserRef.current = null;
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
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
