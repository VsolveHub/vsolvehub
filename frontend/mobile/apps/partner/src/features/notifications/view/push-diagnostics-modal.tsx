import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import * as Notifications from "expo-notifications";
import * as Clipboard from "expo-clipboard";
import { Button, Sheet, Text, cn } from "@vsolve/mobile-ui";
import {
  readRegisteredPushToken,
  registerForPush,
  isPushSupported,
  apiBaseUrl,
} from "@vsolve/mobile-core";
import {
  Bell,
  Check,
  Copy,
  Info,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Volume2,
} from "lucide-react-native";

export function PushDiagnosticsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>("checking...");
  const [copied, setCopied] = useState(false);
  const [testingBackend, setTestingBackend] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isWeb = Platform.OS === "web";
  const supported = isPushSupported();

  const refreshState = async () => {
    setIsRefreshing(true);
    try {
      const storedToken = await readRegisteredPushToken();
      setToken(storedToken);

      if (!isWeb) {
        const perms = await Notifications.getPermissionsAsync();
        setPermissionStatus(perms.status);
      } else {
        setPermissionStatus("unsupported_in_web_preview");
      }
    } catch (err) {
      setPermissionStatus(`error: ${String(err)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (open) {
      void refreshState();
    }
  }, [open]);

  const handleCopyToken = async () => {
    if (!token) return;
    await Clipboard.setStringAsync(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTriggerLocalAlert = async () => {
    if (isWeb) {
      setTestResult("Local notifications require an iOS/Android device or emulator.");
      return;
    }
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "New Instant Job Nearby",
          body: "Tap to review and accept this booking (VSolveHub local test).",
          sound: "booking_alert.wav",
          data: {
            purpose: "partner.offer_created",
            dispatch_offer_id: "test-local-offer",
          },
        },
        trigger: null,
      });
      setTestResult("Local notification triggered with booking alert sound!");
    } catch (err) {
      setTestResult(`Local trigger failed: ${String(err)}`);
    }
  };

  const handleSendBackendTestPush = async () => {
    setTestingBackend(true);
    setTestResult(null);

    try {
      const base = apiBaseUrl();
      const res = await fetch(`${base}/api/v1/dev/mobile/test-push/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Test Instant Job Alert",
          body: "Verification push dispatched via mobile Expo gateway.",
        }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string; intent_id?: string; device_count?: number };
      if (res.ok && data.success) {
        setTestResult(`Success! Push intent dispatched to ${data.device_count ?? 1} device(s). ID: ${data.intent_id?.slice(0, 8)}...`);
      } else {
        setTestResult(`Backend error: ${data.error ?? "Failed to send test push"}`);
      }
    } catch (err) {
      setTestResult(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestingBackend(false);
      void refreshState();
    }
  };

  const handleReRegister = async () => {
    setIsRefreshing(true);
    setTestResult(null);
    try {
      const newToken = await registerForPush({ appKind: "partner" });
      setToken(newToken);
      setTestResult(newToken ? "Device successfully re-registered with backend!" : "Registration returned null (permissions or web mode).");
    } catch (err) {
      setTestResult(`Registration error: ${String(err)}`);
    } finally {
      setIsRefreshing(false);
      void refreshState();
    }
  };

  const isGranted = permissionStatus === "granted";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Push Notification Diagnostics"
      description="Inspect Expo token status, permissions and trigger dispatch alerts"
    >
      <ScrollView className="max-h-[500px]" contentContainerClassName="gap-3 pb-6">
        {/* Status Highlight Banner */}
        <View
          className={cn(
            "rounded-2xl border p-3.5",
            isWeb
              ? "border-blue-200 bg-blue-50/70"
              : isGranted && token
              ? "border-emerald-200 bg-emerald-50/70"
              : "border-amber-200 bg-amber-50/70"
          )}
        >
          <View className="flex-row items-center gap-2.5">
            {isWeb ? (
              <Info size={18} color="#2563eb" />
            ) : isGranted && token ? (
              <ShieldCheck size={18} color="#059669" />
            ) : (
              <ShieldAlert size={18} color="#d97706" />
            )}
            <Text className="text-xs font-bold text-navy-900">
              {isWeb
                ? "Web Browser Preview Mode"
                : isGranted && token
                ? "Push Alerts Active & Ready"
                : "Push Alerts Incomplete"}
            </Text>
          </View>
          <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
            {isWeb
              ? "Expo push tokens are phone-only (APNs/FCM). In web browsers, push notifications use OneSignal on the Web Portal."
              : isGranted && token
              ? "Your device is registered to receive instant job dispatch offers and high-priority audible alerts."
              : "Notification permissions or push tokens are pending. Tap Re-register below to grant access."}
          </Text>
        </View>

        {/* Technical Diagnostics Card */}
        <View className="rounded-2xl border border-line bg-surface p-3.5 gap-2.5">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Device & Transport Info
          </Text>

          {/* Platform */}
          <View className="flex-row items-center justify-between py-1 border-b border-line/60">
            <View className="flex-row items-center gap-2">
              <Smartphone size={14} color="#64748B" />
              <Text className="text-xs text-text-secondary">Platform</Text>
            </View>
            <Text className="text-xs font-medium text-navy-900">
              {Platform.OS.toUpperCase()} {isWeb ? "(Browser)" : "(Native)"}
            </Text>
          </View>

          {/* Permissions */}
          <View className="flex-row items-center justify-between py-1 border-b border-line/60">
            <View className="flex-row items-center gap-2">
              <ShieldCheck size={14} color="#64748B" />
              <Text className="text-xs text-text-secondary">OS Permissions</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View
                className={cn(
                  "size-2 rounded-full",
                  isGranted ? "bg-emerald-500" : "bg-amber-500"
                )}
              />
              <Text className="text-xs font-semibold text-navy-900">
                {permissionStatus}
              </Text>
            </View>
          </View>

          {/* Audio Channel */}
          <View className="flex-row items-center justify-between py-1 border-b border-line/60">
            <View className="flex-row items-center gap-2">
              <Volume2 size={14} color="#64748B" />
              <Text className="text-xs text-text-secondary">Notification Sound</Text>
            </View>
            <Text className="text-xs font-medium text-navy-900">
              booking_alert.wav (Max Priority)
            </Text>
          </View>

          {/* Token */}
          <View className="pt-1 gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-text-secondary">Expo Push Token</Text>
              {token ? (
                <Pressable
                  onPress={handleCopyToken}
                  className="flex-row items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-alt active:bg-line"
                >
                  {copied ? (
                    <Check size={12} color="#059669" />
                  ) : (
                    <Copy size={12} color="#64748B" />
                  )}
                  <Text className="text-[10px] font-medium text-navy-900">
                    {copied ? "Copied" : "Copy"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text
              numberOfLines={2}
              className="text-[11px] font-mono text-text-muted bg-surface-alt p-2 rounded-xl border border-line/60"
            >
              {token ?? (isWeb ? "No push token in browser mode" : "No token cached yet")}
            </Text>
          </View>
        </View>

        {/* Feedback message banner if any */}
        {testResult ? (
          <View className="rounded-xl border border-brand/30 bg-orange-50/90 p-2.5">
            <Text className="text-xs text-brand font-medium">{testResult}</Text>
          </View>
        ) : null}

        {/* Action Controls */}
        <View className="gap-2 pt-1">
          <Button
            variant="primary"
            onPress={handleSendBackendTestPush}
            disabled={testingBackend}
            className="w-full flex-row items-center justify-center gap-2 h-11 bg-brand"
          >
            {testingBackend ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={15} color="#fff" />
            )}
            <Text className="text-xs font-bold text-white">
              {testingBackend ? "Sending push via backend..." : "Send Backend Test Push"}
            </Text>
          </Button>

          <Button
            variant="outline"
            onPress={handleTriggerLocalAlert}
            className="w-full flex-row items-center justify-center gap-2 h-11 border-line"
          >
            <Bell size={15} color="#00246b" />
            <Text className="text-xs font-semibold text-navy-900">
              Test Local Audible Alert
            </Text>
          </Button>

          <Button
            variant="ghost"
            onPress={handleReRegister}
            disabled={isRefreshing}
            className="w-full flex-row items-center justify-center gap-2 h-9"
          >
            <RefreshCw size={13} color="#64748B" />
            <Text className="text-xs font-medium text-text-secondary">
              {isRefreshing ? "Refreshing token..." : "Re-register Push Device"}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </Sheet>
  );
}

