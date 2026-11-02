"use client";

import { useState } from "react";
import { describeError, useCurrentSession } from "@vsolve/query";
import { Badge, Button, ErrorState, Skeleton, usePushPermission } from "@vsolve/ui";
import {
  PUSH_NOTIFICATION_EVENTS,
  trackPushAnalyticsEvent,
} from "@vsolve/config";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle,
  ShieldAlert,
} from "lucide-react";
import { getApiClient } from "@/lib/api/browser";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import {
  usePushNotificationPreferences,
  useUpdatePushNotificationPreference,
  type PushPreferenceItem,
} from "../queries";

const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_CUSTOMER_APP_ID ||
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
  "";

function PushPreferenceRow({
  preference,
  onToggle,
  isSaving,
  error,
}: {
  preference: PushPreferenceItem;
  onToggle: (next: boolean) => void;
  isSaving: boolean;
  error: unknown;
}) {
  const isEnabled = preference.is_enabled;
  const isLocked = !preference.is_mutable;

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0 max-w-prose">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-text">{preference.label}</h3>
          <Badge tone={isLocked ? "action" : "neutral"}>
            {isLocked ? "Required" : "Push"}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">{preference.description}</p>
        {isLocked ? (
          <p className="mt-1 text-xs text-text-muted">
            Critical security and account updates cannot be disabled.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1.5 text-sm font-medium text-danger-text">
            {describeError(error, "mutation").message}
          </p>
        ) : null}
      </div>

      <label
        className={`flex shrink-0 items-center gap-2 text-sm ${
          isLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
        }`}
      >
        <span className="text-text-secondary">{isEnabled ? "On" : "Off"}</span>
        <input
          type="checkbox"
          checked={isEnabled}
          disabled={isSaving || isLocked}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={`${preference.label} push notifications`}
          className="h-6 w-6 cursor-pointer rounded-sm border border-line-strong accent-action disabled:cursor-not-allowed"
        />
      </label>
    </li>
  );
}

export function CustomerPushPreferencesSection() {
  const session = useCurrentSession(getApiClient());
  const userId = session.data?.user?.id ?? null;

  const query = usePushNotificationPreferences();
  const updateMutation = useUpdatePushNotificationPreference();
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  const {
    permissionState,
    requestPermission,
  } = usePushPermission({
    role: "CUSTOMER",
    userId,
    triggerEvent: "manual_settings",
    apiBaseUrl: PUBLIC_API_BASE_URL,
    appId: ONESIGNAL_APP_ID,
  });

  const handleManualEnable = async () => {
    trackPushAnalyticsEvent(PUSH_NOTIFICATION_EVENTS.customerManualEnableClicked, {
      user_id: userId,
      role: "CUSTOMER",
      platform: "web",
      permission_state: permissionState,
      trigger_event: "manual_settings",
      app_id_present: Boolean(ONESIGNAL_APP_ID),
    });

    setIsRequesting(true);
    try {
      await requestPermission();
    } finally {
      setIsRequesting(false);
    }
  };

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3 mt-6">
        <h2 className="text-base font-semibold text-text">Web Push Notifications</h2>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mt-6">
        <ErrorState
          title="We could not load your push notification settings"
          message={describeError(query.error, "read").message}
          actionLabel="Try again"
          onAction={() => void query.refetch()}
          reference={describeError(query.error, "read").reference}
        />
      </div>
    );
  }

  const prefs = query.data?.preferences ?? [];

  return (
    <div className="mt-8 border-t border-line pt-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text">Web Push Notifications</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Control which real-time browser alerts you receive about your bookings and account.
        </p>
      </div>

      {/* Browser Notification Status Banner */}
      <div className="mb-6 rounded-2xl border border-line bg-surface-sunken/40 p-4">
        {permissionState === "granted" && (
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy-900">Notifications active</span>
                <Badge tone="success">Notifications active</Badge>
              </div>
              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                You will receive push updates for your active bookings.
              </p>
            </div>
          </div>
        )}

        {permissionState === "default" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy-900">Get real-time booking updates</span>
                <Badge tone="neutral">Off</Badge>
              </div>
              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                Turn on browser notifications to get immediate alerts when your professional is assigned, on the way, or arrives.
              </p>
            </div>
            <Button
              size="sm"
              loading={isRequesting}
              loadingLabel="Enabling..."
              onClick={handleManualEnable}
              className="shrink-0"
            >
              Turn on live updates
            </Button>
          </div>
        )}

        {permissionState === "denied" && (
          <div className="flex items-start gap-3 text-amber-900">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy-900">Notifications blocked in browser</span>
                <Badge tone="warning">Blocked in browser</Badge>
              </div>
              <p className="mt-1 text-xs text-amber-900/90 leading-relaxed">
                You have blocked notifications for this site. Click the lock/settings icon in your browser address bar, set Notifications to Allow, and refresh the page.
              </p>
            </div>
          </div>
        )}

        {permissionState === "unsupported" && (
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-text-muted shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-muted leading-relaxed">
                Push notifications are not supported on this browser.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Warning callout when browser permission is not granted */}
      {permissionState !== "granted" && (
        <div className="mb-4 rounded-xl px-4 py-2.5 bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span>
            {permissionState === "denied"
              ? "Browser notifications are blocked in your browser settings. Unblock notifications to receive alerts."
              : "Browser notifications are not enabled yet. These preferences will take effect once alerts are allowed."}
          </span>
        </div>
      )}

      {/* Category List */}
      <ul className="flex flex-col">
        {prefs.map((p) => (
          <PushPreferenceRow
            key={p.category}
            preference={p}
            isSaving={pendingCategory === p.category && updateMutation.isPending}
            error={
              pendingCategory === p.category && updateMutation.isError
                ? updateMutation.error
                : null
            }
            onToggle={(next) => {
              setPendingCategory(p.category);
              updateMutation.mutate({ category: p.category, isEnabled: next });
            }}
          />
        ))}
      </ul>
    </div>
  );
}
