"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Sparkles, X } from "lucide-react";
import { useCurrentSession } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";

const DISMISS_KEY = "vsh_job_alerts_dismissed";

/**
 * Floating in-app explainer banner for Partner Instant Job Alerts.
 *
 * ## Rationale & Architecture
 * 1. Over-Navbar Stacking:
 *    Renders with `fixed top-... z-[60]` so it floats cleanly OVER the sticky
 *    navbar (`z-30`) instead of getting clipped behind it on scroll or pushing
 *    the shell layout down.
 * 2. Explicit User Consent:
 *    Never triggers the native browser notification prompt automatically on page load.
 *    Instead, explains why notifications are needed (receiving Instant booking dispatches
 *    even when the app is minimized/in background), and invokes OneSignal's prompt only
 *    when the partner taps "Enable job alerts".
 * 3. Session-Aware:
 *    Only shown to authenticated partners on portal pages (hidden on login/onboarding).
 *    Once granted or dismissed in the active session, it cleanly unmounts.
 */
export function JobAlertsBanner() {
  const pathname = usePathname();
  const session = useCurrentSession(getApiClient());
  const isAuthenticated = Boolean(session.data?.user?.id);

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("granted");
  const [isDismissed, setIsDismissed] = useState(true);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    // Check if dismissed in this session
    try {
      const dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "1";
      setIsDismissed(dismissed);
    } catch {
      setIsDismissed(false);
    }

    setPermission(Notification.permission);

    // Also verify through OneSignal SDK once loaded
    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push((OneSignal) => {
        if (OneSignal.Notifications?.permissionNative) {
          setPermission(OneSignal.Notifications.permissionNative);
        }
      });
    }
  }, []);

  // Do not show if:
  // - User not authenticated or on /login
  // - Notification permission already granted
  // - Notifications not supported
  // - Dismissed by the partner
  if (
    !isAuthenticated ||
    pathname.startsWith("/login") ||
    permission === "granted" ||
    permission === "unsupported" ||
    isDismissed
  ) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore storage quota errors
    }
  };

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
    <aside
      role="alert"
      aria-live="polite"
      aria-label="Job alerts notification permission"
      className="fixed top-[max(0.625rem,env(safe-area-inset-top,0.625rem))] inset-x-0 z-[60] px-3 sm:px-4 pointer-events-none flex justify-center animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-navy-950/10 bg-white/98 p-3.5 shadow-[0_16px_40px_rgba(0,17,46,0.18)] backdrop-blur-2xl transition-all">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <Bell className="h-4 w-4 animate-bounce" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Instant Job Dispatch
              </span>
            </div>
            <p className="text-xs font-medium text-slate-700 leading-snug">
              Enable job alerts to receive Instant booking requests even when this app is in the background.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className="shrink-0 -mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition cursor-pointer"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleEnableAlerts}
            disabled={isPrompting}
            className="inline-flex items-center justify-center rounded-xl bg-navy-950 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-navy-900 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {isPrompting ? "Enabling..." : "Enable job alerts"}
          </button>
        </div>
      </div>
    </aside>
  );
}
