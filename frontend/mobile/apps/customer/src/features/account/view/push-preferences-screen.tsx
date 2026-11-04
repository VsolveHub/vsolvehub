// Ported from frontend/apps/customer/features/account/view/push-preferences.tsx
import { useEffect, useState } from "react";
import { describeError } from "@vsolve/query/native";
import { Badge, Button, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import {
  getNotifications,
  notificationsUnavailable,
  registerForPush,
} from "@vsolve/mobile-core";
import { AlertCircle, AlertTriangle, CheckCircle, ShieldAlert } from "lucide-react-native";
import { Switch, View } from "react-native";

import {
  usePushNotificationPreferences,
  useUpdatePushNotificationPreference,
  type PushPreferenceItem,
} from "../queries";
import { AccountPageShell } from "./account-page-shell";

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
    <View className="flex-row items-start justify-between gap-4 border-b border-line py-4">
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-text">{preference.label}</Text>
          <Badge tone={isLocked ? "action" : "neutral"}>
            {isLocked ? "Required" : "Push"}
          </Badge>
        </View>
        <Text className="mt-1 text-sm text-text-secondary">{preference.description}</Text>
        {isLocked ? (
          <Text className="mt-1 text-xs text-text-muted">
            Critical security and account updates cannot be disabled.
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" className="mt-1.5 text-sm font-medium text-danger-text">
            {describeError(error, "mutation").message}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-center gap-2">
        <Text className="text-sm text-text-secondary">{isEnabled ? "On" : "Off"}</Text>
        <Switch
          value={isEnabled}
          disabled={isSaving || isLocked}
          onValueChange={onToggle}
          accessibilityLabel={`${preference.label} push notifications`}
          trackColor={{ true: "#EA580C", false: "#E2E8F0" }}
        />
      </View>
    </View>
  );
}

export function PushPreferencesScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const query = usePushNotificationPreferences();
  const updateMutation = useUpdatePushNotificationPreference();
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "default" | "unavailable">("default");

  useEffect(() => {
    async function checkPermission() {
      if (notificationsUnavailable) {
        setPermissionState("unavailable");
        return;
      }
      const Notifications = getNotifications();
      if (!Notifications) {
        setPermissionState("unavailable");
        return;
      }
      try {
        const current = await Notifications.getPermissionsAsync();
        if (current.status === "granted") {
          setPermissionState("granted");
        } else if (current.status === "denied") {
          setPermissionState("denied");
        } else {
          setPermissionState("default");
        }
      } catch {
        setPermissionState("unavailable");
      }
    }
    void checkPermission();
  }, []);

  const handleManualEnable = async () => {
    setIsRequesting(true);
    try {
      const token = await registerForPush({ appKind: "customer" });
      if (token) {
        setPermissionState("granted");
      } else {
        const Notifications = getNotifications();
        if (Notifications) {
          const status = await Notifications.getPermissionsAsync();
          setPermissionState(status.status === "granted" ? "granted" : status.status === "denied" ? "denied" : "default");
        }
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const onRefresh = async () => {
    await query.refetch();
  };

  const content = (
    <View className="gap-4">
      <View>
        <Text className="text-lg font-bold text-navy-900">Push Notifications</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Control which real-time alerts you receive about your bookings and account.
        </Text>
      </View>

      {/* Device Notification Status Banner */}
      <View className="rounded-2xl border border-line bg-surface-sunken/40 p-4">
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
                <Text className="text-sm font-bold text-navy-900">Notifications active</Text>
                <Badge tone="success">Notifications active</Badge>
              </View>
              <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
                You will receive push updates for your active bookings.
              </Text>
            </View>
          </View>
        )}

        {permissionState === "default" && (
          <View className="gap-3">
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-bold text-navy-900">Get real-time booking updates</Text>
                <Badge tone="neutral">Off</Badge>
              </View>
              <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
                Turn on device notifications to get immediate alerts when your professional is assigned, on the way, or arrives.
              </Text>
            </View>
            <Button
              size="sm"
              loading={isRequesting}
              loadingLabel="Enabling…"
              onPress={() => void handleManualEnable()}
            >
              Turn on live updates
            </Button>
          </View>
        )}

        {permissionState === "denied" && (
          <View className="flex-row items-start gap-3">
            <ShieldAlert size={20} color="#D97706" className="shrink-0 mt-0.5" />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-bold text-navy-900">Notifications blocked in device settings</Text>
                <Badge tone="warning">Blocked</Badge>
              </View>
              <Text className="mt-1 text-xs text-amber-900/90 leading-relaxed">
                You have blocked notifications for this app. Go to your device settings, set Notifications to Allow, and return to the app.
              </Text>
            </View>
          </View>
        )}
      </View>

      {permissionState !== "granted" && permissionState !== "unavailable" && (
        <View className="rounded-xl px-4 py-2.5 bg-amber-50/70 border border-amber-200/60 flex-row items-center gap-2">
          <AlertTriangle size={14} color="#D97706" className="shrink-0" />
          <Text className="text-[11px] text-amber-900 flex-1">
            {permissionState === "denied"
              ? "Notifications are blocked in device settings. Unblock notifications to receive alerts."
              : "Notifications are not enabled yet. These preferences will take effect once alerts are allowed."}
          </Text>
        </View>
      )}

      {query.isPending && (
        <View className="gap-3 mt-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </View>
      )}

      {query.isError && (
        <ErrorState
          title="We could not load your push notification settings"
          message={describeError(query.error, "read").message}
          actionLabel="Try again"
          onAction={() => void query.refetch()}
          reference={describeError(query.error, "read").reference}
        />
      )}

      {!query.isPending && !query.isError && (
        <View className="flex-col">
          {(query.data?.preferences ?? []).map((p) => (
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
        </View>
      )}
    </View>
  );

  if (embedded) {
    return content;
  }

  return (
    <AccountPageShell
      activeTab="notifications"
      onRefresh={onRefresh}
      refreshing={query.isRefetching}
    >
      {content}
    </AccountPageShell>
  );
}

