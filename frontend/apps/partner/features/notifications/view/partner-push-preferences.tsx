"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentSession } from "@vsolve/query";
import { Badge, Button, Dialog, ErrorState, Skeleton, usePushPermission } from "@vsolve/ui";
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
import { request } from "@vsolve/api-client";
import { browserApiBaseUrl, getApiClient } from "@/lib/api/browser";

const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_PARTNER_APP_ID ||
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
  "";

export interface PushPreferenceItem {
  category: string;
  label: string;
  description: string;
  is_enabled: boolean;
  is_mutable: boolean;
}

export interface PartnerPushPreferencesResponse {
  role: "PARTNER";
  preferences: PushPreferenceItem[];
}

export function usePartnerPushPreferences() {
  return useQuery<PartnerPushPreferencesResponse>({
    queryKey: ["partner", "push-preferences"],
    queryFn: () =>
      request<PartnerPushPreferencesResponse>(() =>
        (getApiClient() as any).GET("/api/v1/partner/notification-preferences/")
      ),
    staleTime: 60_000,
  });
}

export function useUpdatePartnerPushPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { category: string; isEnabled: boolean }) =>
      request<PartnerPushPreferencesResponse>(() =>
        (getApiClient() as any).PATCH("/api/v1/partner/notification-preferences/", {
          body: { category: input.category, is_enabled: input.isEnabled },
        })
      ),
    onSuccess: (data: PartnerPushPreferencesResponse) => {
      queryClient.setQueryData(["partner", "push-preferences"], data);
    },
  });
}

export function PartnerPushPreferencesCard() {
  const session = useCurrentSession(getApiClient());
  const userId = session.data?.user?.id ?? null;

  const query = usePartnerPushPreferences();
  const updateMutation = useUpdatePartnerPushPreference();
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const {
    permissionState,
    requestPermission,
  } = usePushPermission({
    role: "PARTNER",
    userId,
    triggerEvent: "manual_settings",
    apiBaseUrl: browserApiBaseUrl(),
    appId: ONESIGNAL_APP_ID,
  });

  const handleManualEnable = async () => {
    trackPushAnalyticsEvent(PUSH_NOTIFICATION_EVENTS.partnerManualEnableClicked, {
      user_id: userId,
      role: "PARTNER",
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
      <div className="flex flex-col gap-3 p-4 bg-surface rounded-2xl border border-line">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 bg-surface rounded-2xl border border-line">
        <ErrorState
          title="Could not load notification preferences"
          message={query.error instanceof Error ? query.error.message : "Failed to load"}
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      </div>
    );
  }

  const prefs = query.data?.preferences ?? [];

  const handleToggle = (category: string, currentVal: boolean) => {
    const nextVal = !currentVal;
    if (category === "JOB_AND_DISPATCH_ALERTS" && !nextVal) {
      // Show warning before disabling critical job dispatch alerts
      setWarningModalOpen(true);
      return;
    }
    setPendingCategory(category);
    updateMutation.mutate({ category, isEnabled: nextVal });
  };

  const confirmDisableJobAlerts = () => {
    setWarningModalOpen(false);
    setPendingCategory("JOB_AND_DISPATCH_ALERTS");
    updateMutation.mutate({ category: "JOB_AND_DISPATCH_ALERTS", isEnabled: false });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
      <div className="border-b border-line p-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-action" />
          <h2 className="text-sm font-bold text-navy-900">Push Notification Settings</h2>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Configure real-time alerts for incoming dispatch offers, reminders, and product notices.
        </p>
      </div>

      {/* Browser Notification Status Section */}
      <div className="border-b border-line p-4 bg-surface-sunken/40">
        {permissionState === "granted" && (
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy-900">Live alerts active</span>
                <Badge tone="success">Live alerts active</Badge>
              </div>
              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                Your browser is registered to receive background dispatch offers.
              </p>
            </div>
          </div>
        )}

        {permissionState === "default" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy-900">Browser alerts disabled</span>
                <Badge tone="neutral">Off</Badge>
              </div>
              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                Enable browser push notifications to receive real-time alerts for nearby Instant Booking offers.
              </p>
            </div>
            <Button
              size="sm"
              loading={isRequesting}
              loadingLabel="Enabling..."
              onClick={handleManualEnable}
              className="shrink-0"
            >
              Enable job alerts
            </Button>
          </div>
        )}

        {permissionState === "denied" && (
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy-900">Notifications are blocked in your browser</span>
                <Badge tone="warning">Blocked in browser</Badge>
              </div>
              <p className="mt-1 text-xs text-amber-900/90 leading-relaxed">
                To receive job alerts, click the lock/settings icon in your browser address bar and set Notifications to Allow.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHowToModal(true)}
              className="shrink-0 text-xs"
            >
              Show me how
            </Button>
          </div>
        )}

        {permissionState === "unsupported" && (
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-text-muted shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-muted leading-relaxed">
                Web push is not supported on this browser or device.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Warning banner when browser permission is not active */}
      {permissionState !== "granted" && (
        <div className="px-4 py-2.5 bg-amber-50/70 border-b border-line text-[11px] text-amber-900 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span>
            {permissionState === "denied"
              ? "Browser notifications are blocked. Unblock notifications in browser settings to receive alerts."
              : "Browser notifications are not enabled yet. These preferences will take effect once alerts are allowed."}
          </span>
        </div>
      )}

      {/* Category Preference Switches */}
      <ul className="divide-y divide-line/60">
        {prefs.map((p) => {
          const isLocked = !p.is_mutable;
          const isSaving = pendingCategory === p.category && updateMutation.isPending;

          return (
            <li key={p.category} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-navy-900">{p.label}</span>
                  {isLocked ? (
                    <Badge tone="action">Required</Badge>
                  ) : (
                    <Badge tone="neutral">Push</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                  {p.description}
                </p>
              </div>

              <label
                className={`flex shrink-0 items-center gap-2 text-sm ${
                  isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                }`}
              >
                <span className="text-xs font-semibold text-text-secondary">
                  {p.is_enabled ? "On" : "Off"}
                </span>
                <input
                  type="checkbox"
                  checked={p.is_enabled}
                  disabled={isLocked || isSaving}
                  onChange={() => handleToggle(p.category, p.is_enabled)}
                  aria-label={`${p.label} push notifications`}
                  className="h-5 w-5 rounded border-line-strong accent-action disabled:cursor-not-allowed"
                />
              </label>
            </li>
          );
        })}
      </ul>

      {/* Confirmation Dialog for disabling Job Alerts */}
      <Dialog
        open={warningModalOpen}
        onOpenChange={(open) => setWarningModalOpen(open)}
        title="Disable Job & Dispatch Alerts?"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-amber-900 border border-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <p className="text-xs leading-relaxed">
              Disabling job alerts means you will not receive sound or banner notifications when nearby
              Instant Booking jobs become available. You may miss valuable booking opportunities.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setWarningModalOpen(false)}>
              Keep Alerts On
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmDisableJobAlerts}
            >
              Disable Alerts
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Denied Recovery Guidance Modal */}
      <Dialog
        open={showHowToModal}
        onOpenChange={(open) => setShowHowToModal(open)}
        title="Unblock Notifications in Browser"
      >
        <div className="space-y-4 p-4 text-xs text-slate-700">
          <p className="text-slate-600">
            Follow these steps to allow notifications for V-Solve Hub:
          </p>
          <div className="space-y-3 rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <p className="font-semibold text-slate-900">In Chrome, Edge, or Brave:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-600">
              <li>Click the padlock / site settings icon on the left side of the address bar.</li>
              <li>Find <strong>Notifications</strong> in the site permissions list.</li>
              <li>Change the dropdown from <strong>Block</strong> to <strong>Allow</strong>.</li>
              <li>Refresh this page to activate live alerts.</li>
            </ol>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowHowToModal(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
