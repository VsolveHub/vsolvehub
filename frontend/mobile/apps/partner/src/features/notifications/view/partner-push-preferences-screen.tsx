// Ported from frontend/apps/partner/features/notifications/view/partner-push-preferences.tsx
import { useEffect, useState } from "react";
import { Badge, Button, Dialog, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { enablePush, pushPermission, type PushPermission } from "@vsolve/mobile-core";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle,
  ShieldAlert,
} from "lucide-react-native";
import { ScrollView, Switch, View } from "react-native";

import {
  usePartnerPushPreferences,
  useUpdatePartnerPushPreference,
} from "../queries";

/** This screen's names for the phone's notification permission ("default": not asked yet). */
function screenState(permission: PushPermission): "granted" | "denied" | "default" | "unavailable" {
  return permission === "undetermined" ? "default" : permission;
}

export function PartnerPushPreferencesScreen() {
  const query = usePartnerPushPreferences();
  const updateMutation = useUpdatePartnerPushPreference();
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "default" | "unavailable">("default");

  useEffect(() => {
    void pushPermission().then((permission) => setPermissionState(screenState(permission)));
  }, []);

  const handleManualEnable = async () => {
    setIsRequesting(true);
    try {
      setPermissionState(screenState(await enablePush()));
    } finally {
      setIsRequesting(false);
    }
  };

  const handleToggle = (category: string, currentVal: boolean) => {
    const nextVal = !currentVal;
    if (category === "JOB_AND_DISPATCH_ALERTS" && !nextVal) {
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

  if (query.isPending) {
    return (
      <View className="flex-1 bg-canvas p-4 gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View className="flex-1 bg-canvas p-4">
        <ErrorState
          title="Could not load notification preferences"
          message={query.error instanceof Error ? query.error.message : "Failed to load"}
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      </View>
    );
  }

  const prefs = query.data?.preferences ?? [];

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 gap-4 pb-12">
      <View className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xs">
        <View className="border-b border-line p-4">
          <View className="flex-row items-center gap-2">
            <Bell size={20} color="#EA580C" />
            <Text className="text-base font-bold text-navy-900">Push Notification Settings</Text>
          </View>
          <Text className="mt-1 text-xs text-text-secondary">
            Configure real-time alerts for incoming dispatch offers, reminders, and product notices.
          </Text>
        </View>

        {/* Device Notification Status Section */}
        <View className="border-b border-line p-4 bg-surface-sunken/40">
          {permissionState === "unavailable" && (
            <View className="flex-row items-start gap-3">
              <AlertCircle size={20} color="#64748B" className="shrink-0 mt-0.5" />
              <View className="min-w-0 flex-1">
                <Text className="text-xs text-text-muted leading-relaxed">
                  Notifications are not available in Expo Go. They work in the installed app.
                </Text>
              </View>
            </View>
          )}

          {permissionState === "granted" && (
            <View className="flex-row items-start gap-3">
              <CheckCircle size={20} color="#059669" className="shrink-0 mt-0.5" />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-bold text-navy-900">Live alerts active</Text>
                  <Badge tone="success">Live alerts active</Badge>
                </View>
                <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
                  Your device is registered to receive background dispatch offers.
                </Text>
              </View>
            </View>
          )}

          {permissionState === "default" && (
            <View className="gap-3">
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-bold text-navy-900">Device alerts disabled</Text>
                  <Badge tone="neutral">Off</Badge>
                </View>
                <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
                  Enable device push notifications to receive real-time alerts for nearby Instant Booking offers.
                </Text>
              </View>
              <Button
                size="sm"
                loading={isRequesting}
                loadingLabel="Enabling…"
                onPress={() => void handleManualEnable()}
              >
                Enable job alerts
              </Button>
            </View>
          )}

          {permissionState === "denied" && (
            <View className="gap-3">
              <View className="flex-row items-start gap-3">
                <ShieldAlert size={20} color="#D97706" className="shrink-0 mt-0.5" />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-bold text-navy-900">
                      Notifications are blocked in your device settings
                    </Text>
                    <Badge tone="warning">Blocked in device settings</Badge>
                  </View>
                  <Text className="mt-1 text-xs text-amber-900/90 leading-relaxed">
                    To receive job alerts, go to device settings and set Notifications to Allow.
                  </Text>
                </View>
              </View>
              <Button
                variant="outline"
                size="sm"
                onPress={() => setShowHowToModal(true)}
              >
                Show me how
              </Button>
            </View>
          )}
        </View>

        {/* Warning banner when device permission is not active */}
        {permissionState !== "granted" && permissionState !== "unavailable" && (
          <View className="px-4 py-2.5 bg-amber-50/70 border-b border-line flex-row items-center gap-2">
            <AlertTriangle size={14} color="#D97706" className="shrink-0" />
            <Text className="text-[11px] text-amber-900 flex-1">
              {permissionState === "denied"
                ? "Notifications are blocked. Unblock notifications in device settings to receive alerts."
                : "Notifications are not enabled yet. These preferences will take effect once alerts are allowed."}
            </Text>
          </View>
        )}

        {/* Category Preference Switches */}
        <View className="divide-y divide-line/60">
          {prefs.map((p) => {
            const isLocked = !p.is_mutable;
            const isSaving = pendingCategory === p.category && updateMutation.isPending;

            return (
              <View key={p.category} className="flex-row items-start justify-between gap-4 p-4">
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-bold text-navy-900">{p.label}</Text>
                    {isLocked ? (
                      <Badge tone="action">Required</Badge>
                    ) : (
                      <Badge tone="neutral">Push</Badge>
                    )}
                  </View>
                  <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
                    {p.description}
                  </Text>
                </View>

                <View className="flex-row items-center gap-2">
                  <Text className="text-xs font-semibold text-text-secondary">
                    {p.is_enabled ? "On" : "Off"}
                  </Text>
                  <Switch
                    value={p.is_enabled}
                    disabled={isLocked || isSaving}
                    onValueChange={() => handleToggle(p.category, p.is_enabled)}
                    accessibilityLabel={`${p.label} push notifications`}
                    trackColor={{ true: "#EA580C", false: "#E2E8F0" }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Confirmation Dialog for disabling Job Alerts */}
      <Dialog
        open={warningModalOpen}
        onOpenChange={(open) => setWarningModalOpen(open)}
        title="Disable Job & Dispatch Alerts?"
      >
        <View className="gap-4">
          <View className="flex-row items-start gap-3 rounded-xl bg-amber-50 p-3 border border-amber-200">
            <AlertTriangle size={18} color="#D97706" className="shrink-0 mt-0.5" />
            <Text className="text-xs text-amber-900 leading-relaxed flex-1">
              Disabling job alerts means you will not receive sound or banner notifications when nearby
              Instant Booking jobs become available. You may miss valuable booking opportunities.
            </Text>
          </View>

          <View className="flex-row justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onPress={() => setWarningModalOpen(false)}>
              Keep Alerts On
            </Button>
            <Button
              variant="danger"
              size="sm"
              onPress={confirmDisableJobAlerts}
            >
              Disable Alerts
            </Button>
          </View>
        </View>
      </Dialog>

      {/* Denied Recovery Guidance Modal */}
      <Dialog
        open={showHowToModal}
        onOpenChange={(open) => setShowHowToModal(open)}
        title="Unblock Notifications in Device Settings"
      >
        <View className="gap-4">
          <Text className="text-xs text-slate-600">
            Follow these steps to allow notifications for V-Solve Hub:
          </Text>
          <View className="gap-2 rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <Text className="text-xs font-semibold text-slate-900">On your mobile device:</Text>
            <Text className="text-xs text-slate-600">1. Open your phone Settings app.</Text>
            <Text className="text-xs text-slate-600">2. Tap Apps & notifications or Application Manager.</Text>
            <Text className="text-xs text-slate-600">3. Select V Solve Hub from the app list.</Text>
            <Text className="text-xs text-slate-600">4. Tap Notifications and toggle Allow notifications to On.</Text>
          </View>
          <View className="flex-row justify-end pt-2">
            <Button variant="outline" size="sm" onPress={() => setShowHowToModal(false)}>
              Got it
            </Button>
          </View>
        </View>
      </Dialog>
    </ScrollView>
  );
}

