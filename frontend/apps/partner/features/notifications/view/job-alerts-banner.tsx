"use client";

import { useEffect, useState } from "react";
import { Bell, Sparkles, X } from "lucide-react";

/**
 * In-app explainer banner for Partner Instant Job Alerts.
 *
 * ## Rationale
 * Never prompts the browser notification permission dialog automatically on page load.
 * Instead, explains why notifications are needed (Instant jobs arriving in background),
 * and triggers OneSignal's prompt only when the partner explicitly clicks "Enable job alerts".
 */
export function JobAlertsBanner() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("granted");
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    // Also check through OneSignal SDK once ready
    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push((OneSignal) => {
        if (OneSignal.Notifications?.permissionNative) {
          setPermission(OneSignal.Notifications.permissionNative);
        }
      });
    }
  }, []);

  if (permission === "granted" || permission === "unsupported" || isDismissed) {
    return null;
  }

  const handleEnableAlerts = async () => {
    setIsPrompting(true);
    try {
      if (typeof window !== "undefined" && window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            if (OneSignal.User?.PushSubscription?.optIn) {
              await OneSignal.User.PushSubscription.optIn();
            } else if (OneSignal.Notifications?.requestPermission) {
              await OneSignal.Notifications.requestPermission();
            } else if (OneSignal.Slidedown?.promptPush) {
              await OneSignal.Slidedown.promptPush({ force: true });
            }
            if (typeof window !== "undefined" && "Notification" in window) {
              setPermission(Notification.permission);
            }
          } catch (err) {
            console.warn("[OneSignal] prompt error:", err);
          } finally {
            setIsPrompting(false);
          }
        });
      } else if (typeof window !== "undefined" && "Notification" in window) {
        const res = await Notification.requestPermission();
        setPermission(res);
        setIsPrompting(false);
      }
    } catch {
      setIsPrompting(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Job alerts notification permission"
      className="relative z-30 mx-auto w-full max-w-5xl px-4 py-2"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-linear-to-r from-primary/10 via-primary/5 to-surface p-4 shadow-sm backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
            <Bell className="h-5 w-5 animate-pulse" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide uppercase text-primary flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Instant Job Dispatch
              </span>
            </div>
            <p className="text-sm font-semibold text-text">
              Enable job alerts to receive Instant booking requests even when this app is in the background.
            </p>
          </div>
        </div>

        <div className="flex w-full sm:w-auto items-center gap-2 pt-1 sm:pt-0">
          <button
            type="button"
            onClick={handleEnableAlerts}
            disabled={isPrompting}
            className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90 focus:outline-hidden focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          >
            {isPrompting ? "Enabling..." : "Enable job alerts"}
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss banner"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-hover hover:text-text transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
