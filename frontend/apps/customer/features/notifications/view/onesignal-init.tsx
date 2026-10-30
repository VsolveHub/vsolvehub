"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { useCustomerSession } from "@/features/session/queries";

const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "a4b12340-473f-4349-a874-bd4d1128688e";

/**
 * Initializes the OneSignal Web Push SDK and syncs customer identity.
 *
 * ## Architecture
 * - Loads the v16 OneSignal page SDK after the page becomes interactive.
 * - Enqueues initialization through `OneSignalDeferred` so it never blocks paint.
 * - Flags `allowLocalhostAsSecureOrigin` when running on localhost / 127.0.0.1.
 * - Links the active customer session via `OneSignal.login(userId)` and unbinds on logout.
 */
export function OneSignalInit() {
  const session = useCustomerSession();
  const userId = session.isAuthenticated ? session.userId : null;
  const loggedInUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ONESIGNAL_APP_ID) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");

      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: isLocalhost,
        });
      } catch (err) {
        // Prevent duplicate init errors in development hot-reloading
        if (process.env.NODE_ENV === "development") {
          console.warn("[OneSignal] init warning:", err);
        }
      }
    });
  }, []);

  // Sync external user id with OneSignal
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
