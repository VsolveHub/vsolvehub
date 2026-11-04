"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, Navigation, ShieldAlert, X } from "lucide-react";
import { useCurrentSession } from "@vsolve/query";
import { Card, Button, usePushPermission } from "@vsolve/ui";
import {
  PUSH_NOTIFICATION_EVENTS,
  trackPushAnalyticsEvent,
} from "@vsolve/config";
import { getApiClient } from "@/lib/api/browser";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

// This site's own OneSignal app only; there is no shared App ID to fall back to.
const CUSTOMER_ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_CUSTOMER_APP_ID ?? "";

const RECOVERY_DISMISSED_KEY = "vsh_customer_push_denied_recovery_dismissed";

export interface CustomerPushPromptCardProps {
  bookingId?: string;
  className?: string;
}

/**
 * Custom pre-permission card shown on the booking confirmation screen (/bookings/[id]).
 *
 * ## Trigger Rules
 * - NEVER appears on initial app load, catalog browsing, cart, checkout, or payment.
 * - Shown only after booking confirmation.
 * - Suppressed when permission is already granted, unsupported, or during the 14-day dismissal cooldown.
 * - Primary CTA requests native permission via OneSignal SDK.
 * - Denial transitions to non-intrusive recovery UI and avoids repeated prompts.
 */
export function CustomerPushPromptCard({
  bookingId,
  className = "",
}: CustomerPushPromptCardProps) {
  const session = useCurrentSession(getApiClient());
  const userId = session.data?.user?.id ?? null;

  const [isDismissed, setIsDismissed] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [showDeniedRecovery, setShowDeniedRecovery] = useState(false);
  const promptViewedTrackedRef = useRef(false);

  const {
    permissionState,
    isPromptEligible,
    requestPermission,
    dismissPrompt,
    promptCount,
  } = usePushPermission({
    role: "CUSTOMER",
    userId,
    triggerEvent: "booking_confirmation_screen",
    apiBaseUrl: PUBLIC_API_BASE_URL,
    appId: CUSTOMER_ONESIGNAL_APP_ID,
  });

  // Track prompt viewed once when eligible and visible
  useEffect(() => {
    if (
      isPromptEligible &&
      !isDismissed &&
      !showDeniedRecovery &&
      !promptViewedTrackedRef.current
    ) {
      promptViewedTrackedRef.current = true;
      trackPushAnalyticsEvent(PUSH_NOTIFICATION_EVENTS.customerPromptViewed, {
        user_id: userId,
        role: "CUSTOMER",
        platform: "web",
        permission_state: "default",
        trigger_event: "booking_confirmation_screen",
        prompt_count: promptCount,
        app_id_present: Boolean(CUSTOMER_ONESIGNAL_APP_ID),
      });
    }
  }, [isPromptEligible, isDismissed, showDeniedRecovery, userId, promptCount]);

  // Handle primary CTA: request push permission
  const handleEnablePush = async () => {
    setIsRequesting(true);
    try {
      const result = await requestPermission();
      setIsRequesting(false);

      if (result === "granted") {
        setIsDismissed(true);
      } else if (result === "denied") {
        setShowDeniedRecovery(true);
        trackPushAnalyticsEvent(
          PUSH_NOTIFICATION_EVENTS.customerPermissionDeniedRecoveryViewed,
          {
            user_id: userId,
            role: "CUSTOMER",
            platform: "web",
            permission_state: "denied",
            trigger_event: "booking_confirmation_screen",
            prompt_count: promptCount,
            app_id_present: Boolean(CUSTOMER_ONESIGNAL_APP_ID),
          },
        );
      } else {
        setIsDismissed(true);
      }
    } catch {
      setIsRequesting(false);
      setIsDismissed(true);
    }
  };

  // Secondary CTA: "Maybe later" (14-day dismissal cooldown)
  const handleDismiss = () => {
    dismissPrompt();
    setIsDismissed(true);
  };

  // Close recovery guidance
  const handleDismissRecovery = () => {
    setShowDeniedRecovery(false);
    setIsDismissed(true);
    try {
      window.sessionStorage.setItem(RECOVERY_DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  };

  // If already granted, unsupported, or dismissed in session/cooldown
  if (
    permissionState === "granted" ||
    permissionState === "unsupported" ||
    isDismissed
  ) {
    return null;
  }

  // If not eligible (e.g. 14 days cooldown active) and not showing active denied recovery
  if (!isPromptEligible && !showDeniedRecovery) {
    return null;
  }

  // Denied Recovery State
  if (showDeniedRecovery) {
    return (
      <Card
        className={`relative overflow-hidden border-amber-200/70 bg-gradient-to-r from-amber-50/70 to-orange-50/50 p-4 sm:p-5 shadow-xs ${className}`}
        role="alert"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={handleDismissRecovery}
          aria-label="Dismiss notification recovery notice"
          className="absolute right-3.5 top-3.5 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/80 hover:text-slate-600 transition"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1 pr-6">
            <h3 className="text-sm font-bold text-slate-900">
              Notifications are blocked in your browser
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              To get live booking updates, click the lock/settings icon in your browser address bar and set Notifications to Allow.
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismissRecovery}
                className="text-xs"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Default Pre-Permission Card
  return (
    <Card
      className={`relative overflow-hidden border-navy-950/10 bg-gradient-to-br from-white to-slate-50/80 p-4 sm:p-5 shadow-sm ${className}`}
      role="region"
      aria-label="Live booking updates permission"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss notification card"
        className="absolute right-3.5 top-3.5 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-950 text-white shadow-sm">
          <Navigation className="h-5 w-5 text-amber-400" />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5 pr-6 sm:pr-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
              <Bell className="h-3 w-3" /> Live Tracking
            </span>
          </div>

          <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
            Track your professional in real time
          </h3>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Enable notifications to get updates when your professional is assigned, on the way, and arrives.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2.5">
            <Button
              variant="primary"
              size="sm"
              loading={isRequesting}
              onClick={handleEnablePush}
              className="text-xs font-semibold"
            >
              Turn on live updates
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Maybe later
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

