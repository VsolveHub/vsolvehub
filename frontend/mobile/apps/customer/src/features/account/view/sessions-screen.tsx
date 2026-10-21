// Ported from frontend/apps/customer/features/account/view/session-list.tsx
// Exact match with Image 4 (Signed-in devices tab)
import { describeError, useRevokeSession, useSessionDevices, type UserSession } from "@vsolve/query/native";
import { getApiClient, useMobileLogout } from "@vsolve/mobile-core";
import { Badge, Button, ConfirmAction, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { AccountPageShell } from "./account-page-shell";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function SessionsScreen() {
  const api = getApiClient();
  const sessionsQuery = useSessionDevices(api);
  const revoke = useRevokeSession(api);
  const signOut = useMobileLogout();
  const [revokingTarget, setRevokingTarget] = useState<UserSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await sessionsQuery.refetch();
    setRefreshing(false);
  };

  if (sessionsQuery.isPending) {
    return (
      <AccountPageShell activeTab="devices" onRefresh={onRefresh} refreshing={refreshing}>
        <View className="py-12 items-center justify-center">
          <Spinner size="sm" />
        </View>
      </AccountPageShell>
    );
  }

  if (sessionsQuery.isError) {
    return (
      <AccountPageShell activeTab="devices" onRefresh={onRefresh} refreshing={refreshing}>
        <ErrorState
          title="We could not load your sessions"
          message={describeError(sessionsQuery.error, "read").message}
          actionLabel="Try again"
          onAction={() => void sessionsQuery.refetch()}
        />
      </AccountPageShell>
    );
  }

  const sessions = sessionsQuery.data ?? [];

  return (
    <AccountPageShell activeTab="devices" onRefresh={onRefresh} refreshing={refreshing}>
      <View className="overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-xs">
        {/* Section Header matching Image 4 */}
        <Text className="text-xl font-extrabold tracking-tight text-navy-950">
          Signed-in devices
        </Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Every device signed in to this account. End any you do not recognise.
        </Text>

        {sessions.length === 0 ? (
          <View className="py-8 items-center justify-center">
            <Text className="text-sm text-text-muted">No active sessions found.</Text>
          </View>
        ) : (
          <View className="mt-4 divide-y divide-line/60">
            {sessions.map((session) => {
              const deviceLabel = session.device_label?.trim() || "Unrecognised device";

              return (
                <View
                  key={session.id}
                  className="flex-row items-center justify-between gap-4 py-4"
                >
                  <View className="min-w-0 flex-1">
                    {/* Device Label and Badges matching Image 4 */}
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="text-sm font-bold text-navy-900">{deviceLabel}</Text>
                      {session.is_current ? (
                        <View className="rounded-full bg-[#EFF6FF] px-2 py-0.5">
                          <Text className="text-[11px] font-bold text-[#1D4ED8]">This device</Text>
                        </View>
                      ) : null}
                      <View className="rounded-full bg-[#F7F5F0] px-2 py-0.5">
                        <Text className="text-[11px] font-medium text-[#756C5E]">
                          Acting as {session.active_role || "customer"}
                        </Text>
                      </View>
                    </View>

                    {/* Timestamp lines matching Image 4 */}
                    <Text className="mt-1 text-xs text-text-muted">
                      Signed in {formatDate(session.created_at)} · Last used {formatDate(session.last_seen_at)}
                    </Text>
                    <Text className="mt-0.5 text-xs text-text-muted">
                      Ends {formatDate(session.expires_at)}
                    </Text>
                  </View>

                  {/* Action Button on Right matching Image 4 */}
                  {session.is_current ? (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setRevokingTarget(session)}
                      className="h-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white px-3.5 active:bg-[#FAF9F7]"
                    >
                      <Text className="text-xs font-semibold text-navy-900">Sign out here</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setRevokingTarget(session)}
                      className="h-9 shrink-0 items-center justify-center px-2 active:opacity-70"
                    >
                      <Text className="text-xs font-bold text-[#1D4ED8]">End session</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Confirmation Modal */}
        <ConfirmAction
          open={revokingTarget !== null}
          onOpenChange={(open) => !open && setRevokingTarget(null)}
          title={revokingTarget?.is_current ? "Sign out of this device?" : "End this session?"}
          consequence={
            revokingTarget?.is_current
              ? "You will need to sign in again to access your account."
              : "That device will be signed out immediately."
          }
          confirmLabel={revokingTarget?.is_current ? "Sign out" : "End session"}
          pending={revoke.isPending}
          destructive={revokingTarget?.is_current}
          onConfirm={() => {
            if (revokingTarget) {
              revoke.mutate(
                { sessionId: revokingTarget.id, isCurrent: revokingTarget.is_current },
                {
                  onSuccess: () => {
                    const isCurr = revokingTarget.is_current;
                    setRevokingTarget(null);
                    if (isCurr) {
                      void signOut();
                    } else {
                      void sessionsQuery.refetch();
                    }
                  },
                },
              );
            }
          }}
        />
      </View>
    </AccountPageShell>
  );
}
