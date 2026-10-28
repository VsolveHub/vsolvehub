"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Send, BellRing, Bug, ChevronUp, ChevronDown } from "lucide-react";
import { useCurrentSession } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";

interface OneSignalDebugState {
  permissionStatus: string;
  isOptedIn: boolean;
  onesignalId: string | null;
  externalId: string | null;
  subscriptionId: string | null;
}

/**
 * Development-only OneSignal debug panel for the Partner Portal.
 * Visible ONLY when NEXT_PUBLIC_APP_ENV === "local".
 */
export function OneSignalDebugPanel() {
  const isLocalEnv = process.env.NEXT_PUBLIC_APP_ENV === "local";
  const session = useCurrentSession(getApiClient());
  const currentUserId = session.data?.user?.id ?? null;

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [debugState, setDebugState] = useState<OneSignalDebugState>({
    permissionStatus: "unknown",
    isOptedIn: false,
    onesignalId: null,
    externalId: null,
    subscriptionId: null,
  });

  const refreshDebugInfo = () => {
    if (typeof window === "undefined") return;

    const browserPermission = "Notification" in window ? Notification.permission : "unsupported";

    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push((OneSignal) => {
        try {
          const permNative =
            OneSignal.Notifications?.permissionNative ||
            (OneSignal.Notifications?.permission ? "granted" : browserPermission);

          const optedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
          const onesignalId = OneSignal.User?.onesignalId ?? null;
          const externalId = OneSignal.User?.externalId ?? currentUserId;
          const subId = OneSignal.User?.PushSubscription?.id ?? null;

          setDebugState({
            permissionStatus: permNative,
            isOptedIn: optedIn,
            onesignalId,
            externalId,
            subscriptionId: subId,
          });
        } catch (err) {
          console.warn("[OneSignalDebug] failed to read debug state:", err);
        }
      });
    } else {
      setDebugState((prev) => ({
        ...prev,
        permissionStatus: browserPermission,
        externalId: currentUserId,
      }));
    }
  };

  useEffect(() => {
    if (!isLocalEnv) return;
    refreshDebugInfo();
    const interval = setInterval(refreshDebugInfo, 2000);

    if (typeof window !== "undefined" && window.OneSignalDeferred) {
      window.OneSignalDeferred.push((OneSignal) => {
        try {
          OneSignal.User?.PushSubscription?.addEventListener("change", refreshDebugInfo);
          OneSignal.Notifications?.addEventListener("permissionChange", refreshDebugInfo);
        } catch {
          // ignore
        }
      });
    }

    return () => clearInterval(interval);
  }, [isLocalEnv, currentUserId]);

  if (!isLocalEnv) {
    return null;
  }

  const handleRequestPermission = () => {
    if (typeof window !== "undefined" && window.OneSignalDeferred) {
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          setTestResult(null);
          if (OneSignal.User?.PushSubscription?.optIn) {
            await OneSignal.User.PushSubscription.optIn();
          } else if (OneSignal.Notifications?.requestPermission) {
            await OneSignal.Notifications.requestPermission();
          } else if (OneSignal.Slidedown?.promptPush) {
            await OneSignal.Slidedown.promptPush({ force: true });
          }
          refreshDebugInfo();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[OneSignalDebug] permission request failed:", err);
          setTestResult(`Permission/Opt-in error: ${msg}`);
        }
      });
    }
  };

  const handleSendTestPush = async () => {
    const targetId = debugState.externalId || currentUserId;
    if (!targetId) {
      setTestResult("No partner logged in (no external_id)");
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (typeof document !== "undefined") {
        const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        if (match?.[1]) {
          headers["X-CSRFToken"] = match[1];
        }
      }

      const response = await fetch("/api/v1/dev/onesignal/test-push/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          external_id: targetId,
          heading: "Test Instant Job Alert",
          body: "This is a local dev verification push notification.",
          url: "http://localhost:3001/work/jobs",
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setTestResult(`Sent! Push ID: ${data.notification_id}`);
      } else {
        setTestResult(`Error: ${JSON.stringify(data.errors || data)}`);
      }
    } catch (err: unknown) {
      setTestResult(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSendingTest(false);
      refreshDebugInfo();
    }
  };

  const handleTestDirectNotification = () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          const notif = new Notification("Windows Notification Test", {
            body: "If you see this, Chrome & Windows notifications are working!",
            icon: "/apple-touch-icon.png",
          });
          notif.onclick = () => window.focus();
          setTestResult("Dispatched direct browser notification!");
        } else {
          setTestResult(`Notification permission is: ${Notification.permission}`);
        }
      }
    } catch (err) {
      setTestResult(`Direct notification error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCopyDebugInfo = async () => {
    try {
      const payload = JSON.stringify(
        {
          ...debugState,
          sessionUserId: currentUserId,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      );
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <aside
      aria-label="OneSignal Local Debug Panel"
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 text-xs font-mono"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-full bg-navy-950 px-3.5 py-2 text-amber-300 shadow-xl border border-amber-500/30 hover:bg-navy-900 transition cursor-pointer"
      >
        <Bug className="h-4 w-4" />
        <span className="font-bold">OneSignal Dev</span>
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {isOpen && (
        <div className="w-80 rounded-2xl border border-line bg-surface/95 p-4 shadow-2xl backdrop-blur-md space-y-3 text-text">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="font-bold text-sm flex items-center gap-1.5 text-primary">
              <BellRing className="h-4 w-4" /> Push Debug Info
            </span>
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
              local env
            </span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between py-0.5">
              <span className="text-text-secondary">Permission:</span>
              <span
                className={`font-bold ${
                  debugState.permissionStatus === "granted"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {debugState.permissionStatus}
              </span>
            </div>

            <div className="flex justify-between py-0.5">
              <span className="text-text-secondary">Opted In:</span>
              <span
                className={`font-bold ${
                  debugState.isOptedIn
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {debugState.isOptedIn ? "YES" : "NO"}
              </span>
            </div>

            <div className="py-0.5">
              <span className="text-text-secondary block">OneSignal ID:</span>
              <span className="font-semibold block truncate text-[10px] select-all">
                {debugState.onesignalId || "None"}
              </span>
            </div>

            <div className="py-0.5">
              <span className="text-text-secondary block">External ID:</span>
              <span className="font-semibold block truncate text-[10px] select-all">
                {debugState.externalId || currentUserId || "None"}
              </span>
            </div>

            <div className="py-0.5">
              <span className="text-text-secondary block">Subscription ID:</span>
              <span className="font-semibold block truncate text-[10px] select-all">
                {debugState.subscriptionId || "None"}
              </span>
            </div>
          </div>

          {testResult && (
            <div className="rounded-lg bg-surface-muted p-2 text-[10px] break-all border border-line">
              {testResult}
            </div>
          )}

          <div className="flex flex-col gap-1.5 pt-1">
            <button
              type="button"
              onClick={handleRequestPermission}
              className="w-full rounded-lg bg-surface-hover py-1.5 px-2.5 text-left font-semibold text-text hover:bg-line/40 transition flex items-center justify-between"
            >
              <span>Request notification permission</span>
              <BellRing className="h-3.5 w-3.5 text-primary" />
            </button>

            <button
              type="button"
              onClick={handleSendTestPush}
              disabled={sendingTest}
              className="w-full rounded-lg bg-primary py-1.5 px-2.5 text-left font-semibold text-white hover:bg-primary/90 transition flex items-center justify-between disabled:opacity-50"
            >
              <span>{sendingTest ? "Sending..." : "Send test push notification"}</span>
              <Send className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={handleTestDirectNotification}
              className="w-full rounded-lg bg-surface-hover py-1.5 px-2.5 text-left font-semibold text-text hover:bg-line/40 transition flex items-center justify-between"
            >
              <span>Test direct browser toast</span>
              <BellRing className="h-3.5 w-3.5 text-amber-500" />
            </button>

            <button
              type="button"
              onClick={handleCopyDebugInfo}
              className="w-full rounded-lg border border-line py-1.5 px-2.5 text-left font-semibold text-text hover:bg-surface-hover transition flex items-center justify-between"
            >
              <span>{copied ? "Copied to clipboard!" : "Copy subscription debug info"}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-text-secondary" />
              )}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
