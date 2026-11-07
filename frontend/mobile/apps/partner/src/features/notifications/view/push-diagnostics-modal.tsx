import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Sheet, Text, cn } from "@vsolve/mobile-ui";
import { getApiClient, linkPushUser, pushStatus, type PushPermission } from "@vsolve/mobile-core";
import { Check, Copy, Info, RefreshCw, Send, ShieldAlert, ShieldCheck, Smartphone, Volume2 } from "lucide-react-native";

type Status = Awaited<ReturnType<typeof pushStatus>>;

const PERMISSION_LABEL: Record<PushPermission, string> = {
  granted: "granted",
  denied: "denied (turn on in phone settings)",
  undetermined: "not asked yet",
  unavailable: "unavailable in this build",
};

/**
 * This phone's push setup: OneSignal subscription, permission and a test push. A support tool;
 * the test push exists only on a development server.
 */
export function PushDiagnosticsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [copied, setCopied] = useState(false);
  const [testingBackend, setTestingBackend] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isWeb = Platform.OS === "web";

  const refreshState = async () => {
    setIsRefreshing(true);
    try {
      setStatus(await pushStatus());
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (open) void refreshState();
  }, [open]);

  const subscriptionId = status?.subscriptionId ?? null;
  const ready = status?.permission === "granted" && subscriptionId !== null && status.optedIn;

  const handleCopyId = async () => {
    if (!subscriptionId) return;
    await Clipboard.setStringAsync(subscriptionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendBackendTestPush = async () => {
    setTestingBackend(true);
    setTestResult(null);
    try {
      const { response } = await getApiClient().POST("/api/v1/dev/onesignal/test-push/");
      setTestResult(
        response.ok
          ? "Test push sent through OneSignal. It should arrive in a few seconds."
          : response.status === 404
            ? "Test pushes are only available on a development server."
            : `The server refused the test push (HTTP ${response.status}).`,
      );
    } catch (err) {
      setTestResult(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestingBackend(false);
    }
  };

  const handleReLink = async () => {
    setIsRefreshing(true);
    setTestResult(null);
    try {
      const permission = await linkPushUser({ appKind: "partner" });
      setTestResult(
        permission === "granted"
          ? "This phone is linked to your account for push."
          : `Push permission is ${PERMISSION_LABEL[permission]}.`,
      );
    } finally {
      setIsRefreshing(false);
      void refreshState();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Push Notification Diagnostics"
      description="Inspect this phone's OneSignal subscription, permission and test pushes"
    >
      <ScrollView className="max-h-[500px]" contentContainerClassName="gap-3 pb-6">
        {/* Status Highlight Banner */}
        <View
          className={cn(
            "rounded-2xl border p-3.5",
            isWeb ? "border-blue-200 bg-blue-50/70" : ready ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70",
          )}
        >
          <View className="flex-row items-center gap-2.5">
            {isWeb ? (
              <Info size={18} color="#2563eb" />
            ) : ready ? (
              <ShieldCheck size={18} color="#059669" />
            ) : (
              <ShieldAlert size={18} color="#d97706" />
            )}
            <Text className="text-xs font-bold text-navy-900">
              {isWeb ? "Web Browser Preview Mode" : ready ? "Push Alerts Active & Ready" : "Push Alerts Incomplete"}
            </Text>
          </View>
          <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
            {isWeb
              ? "Phone push runs in the installed app. In a browser, the Partner website's own notifications apply."
              : ready
                ? "This phone receives instant job offers and other alerts, including the job offer sound."
                : "Notification permission or the OneSignal subscription is pending. Tap Re-link below."}
          </Text>
        </View>

        {/* Technical Diagnostics Card */}
        <View className="rounded-2xl border border-line bg-surface p-3.5 gap-2.5">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">Device & Transport Info</Text>

          <View className="flex-row items-center justify-between py-1 border-b border-line/60">
            <View className="flex-row items-center gap-2">
              <Smartphone size={14} color="#64748B" />
              <Text className="text-xs text-text-secondary">Platform</Text>
            </View>
            <Text className="text-xs font-medium text-navy-900">
              {Platform.OS.toUpperCase()} {isWeb ? "(Browser)" : "(Native)"}
            </Text>
          </View>

          <View className="flex-row items-center justify-between py-1 border-b border-line/60">
            <View className="flex-row items-center gap-2">
              <ShieldCheck size={14} color="#64748B" />
              <Text className="text-xs text-text-secondary">OS Permissions</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className={cn("size-2 rounded-full", status?.permission === "granted" ? "bg-emerald-500" : "bg-amber-500")} />
              <Text className="text-xs font-semibold text-navy-900">
                {status ? PERMISSION_LABEL[status.permission] : "checking…"}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between py-1 border-b border-line/60">
            <View className="flex-row items-center gap-2">
              <Volume2 size={14} color="#64748B" />
              <Text className="text-xs text-text-secondary">Job offer sound</Text>
            </View>
            <Text className="text-xs font-medium text-navy-900">booking_alert.wav</Text>
          </View>

          <View className="pt-1 gap-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-text-secondary">OneSignal subscription</Text>
              {subscriptionId ? (
                <Pressable
                  onPress={handleCopyId}
                  className="flex-row items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-alt active:bg-line"
                >
                  {copied ? <Check size={12} color="#059669" /> : <Copy size={12} color="#64748B" />}
                  <Text className="text-[10px] font-medium text-navy-900">{copied ? "Copied" : "Copy"}</Text>
                </Pressable>
              ) : null}
            </View>
            <Text
              numberOfLines={2}
              className="text-[11px] font-mono text-text-muted bg-surface-alt p-2 rounded-xl border border-line/60"
            >
              {subscriptionId ?? (status?.supported ? "Not registered with OneSignal yet" : "Push is not available in this build")}
            </Text>
          </View>
        </View>

        {testResult ? (
          <View className="rounded-xl border border-brand/30 bg-orange-50/90 p-2.5">
            <Text className="text-xs text-brand font-medium">{testResult}</Text>
          </View>
        ) : null}

        <View className="gap-2 pt-1">
          <Button
            variant="primary"
            onPress={handleSendBackendTestPush}
            disabled={testingBackend}
            className="w-full flex-row items-center justify-center gap-2 h-11 bg-brand"
          >
            {testingBackend ? <ActivityIndicator size="small" color="#fff" /> : <Send size={15} color="#fff" />}
            <Text className="text-xs font-bold text-white">
              {testingBackend ? "Sending push via backend..." : "Send Backend Test Push"}
            </Text>
          </Button>

          <Button
            variant="ghost"
            onPress={handleReLink}
            disabled={isRefreshing}
            className="w-full flex-row items-center justify-center gap-2 h-9"
          >
            <RefreshCw size={13} color="#64748B" />
            <Text className="text-xs font-medium text-text-secondary">
              {isRefreshing ? "Checking..." : "Re-link this phone for push"}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </Sheet>
  );
}
