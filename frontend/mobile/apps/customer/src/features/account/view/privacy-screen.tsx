// Ported from frontend/apps/customer/features/account/view/privacy-requests.tsx
// and consent-receipts.tsx
// Exact match with Image 3 (Privacy tab: Consents & Your data)
import { describeError } from "@vsolve/query/native";
import { Badge, Button, ConfirmAction, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import {
  isRequestOpen,
  useCreatePrivacyRequest,
  usePrivacyRequests,
  type PrivacyRequest,
} from "@/features/account/queries";
import { AccountPageShell } from "./account-page-shell";

export function PrivacyScreen() {
  const requests = usePrivacyRequests();
  const create = useCreatePrivacyRequest();

  const [confirmingErasure, setConfirmingErasure] = useState(false);
  const [confirmingAccess, setConfirmingAccess] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await requests.refetch();
    setRefreshing(false);
  };

  const requestList = requests.data ?? [];
  const openErasure = requestList.filter((r) => r.kind === "ERASURE").find(isRequestOpen);
  const openAccess = requestList.filter((r) => r.kind === "ACCESS").find(isRequestOpen);

  if (requests.isPending) {
    return (
      <AccountPageShell activeTab="privacy" onRefresh={onRefresh} refreshing={refreshing}>
        <View className="py-12 items-center justify-center">
          <Spinner size="sm" />
        </View>
      </AccountPageShell>
    );
  }

  if (requests.isError) {
    return (
      <AccountPageShell activeTab="privacy" onRefresh={onRefresh} refreshing={refreshing}>
        <ErrorState
          title="We could not load your privacy requests"
          message={describeError(requests.error, "read").message}
          actionLabel="Try again"
          onAction={() => void requests.refetch()}
        />
      </AccountPageShell>
    );
  }

  return (
    <AccountPageShell activeTab="privacy" onRefresh={onRefresh} refreshing={refreshing}>
      <View className="gap-6">
        {/* Card 1: Consents matching Image 3 */}
        <View className="overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <Text className="text-xl font-extrabold tracking-tight text-navy-950">Consents</Text>
          <Text className="mt-1 text-sm text-text-secondary">
            What you have agreed to, and when we record it.
          </Text>

          <View className="mt-4 gap-2.5">
            <View className="rounded-xl bg-[#F7F5F0] p-4">
              <Text className="text-sm font-bold text-navy-900">
                When you agree to the terms at checkout
              </Text>
              <Text className="mt-1 text-xs leading-relaxed text-text-secondary">
                Paying for a booking records that you accepted the terms in force that day.
              </Text>
            </View>

            <View className="rounded-xl bg-[#F7F5F0] p-4">
              <Text className="text-sm font-bold text-navy-900">
                When an agent books for you
              </Text>
              <Text className="mt-1 text-xs leading-relaxed text-text-secondary">
                If someone from V Solve Hub books on a call with you, we cannot complete it without your consent on record first.
              </Text>
            </View>

            <View className="rounded-xl border border-[#D0E2F7] bg-[#EDF4FC] p-3.5">
              <Text className="text-xs leading-relaxed text-[#1E3A8A]">
                Your consent record is held on our side and is not shown here yet. Ask for a copy of your data below and it comes with the rest of your account.
              </Text>
            </View>
          </View>
        </View>

        {/* Card 2: Your data matching Image 3 */}
        <View className="overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <Text className="text-xl font-extrabold tracking-tight text-navy-950">Your data</Text>
          <Text className="mt-1 text-sm text-text-secondary">
            Ask for a copy of what we hold, or ask us to delete it.
          </Text>

          {/* Action Boxes */}
          <View className="mt-4 flex-col gap-3.5">
            {/* Box A: Get copy of my data */}
            <View className="rounded-xl bg-[#F7F5F0] p-4">
              <Text className="text-sm font-bold text-navy-900">Get a copy of my data</Text>
              <Text className="mt-1 text-xs leading-relaxed text-text-secondary">
                We put together everything held against your account — your bookings, addresses, payments and the consents on record — and send it to you.
              </Text>
              <View className="mt-3.5">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmingAccess(true)}
                  disabled={openAccess !== undefined || create.isPending}
                  className="h-10 self-start items-center justify-center rounded-xl bg-[#0B1B3D] px-4 active:bg-[#071328] disabled:opacity-50"
                >
                  <Text className="text-xs font-bold text-white">
                    {openAccess ? "Request submitted" : "Get a copy of my data"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Box B: Delete my data */}
            <View className="rounded-xl bg-[#F7F5F0] p-4">
              <Text className="text-sm font-bold text-navy-900">Delete my data</Text>
              <Text className="mt-1 text-xs leading-relaxed text-text-secondary">
                We remove what we are not required to keep. Records tax and consumer law require us to hold, such as invoices for completed work, stay until they expire.
              </Text>
              <View className="mt-3.5">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmingErasure(true)}
                  disabled={openErasure !== undefined || create.isPending}
                  className="h-10 self-start items-center justify-center rounded-xl border border-line bg-white px-4 active:bg-[#FAF9F7] disabled:opacity-50"
                >
                  <Text className="text-xs font-semibold text-navy-900">
                    {openErasure ? "Request pending" : "Delete my data"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Requests you have made section matching Image 3 */}
          <View className="mt-5 border-t border-line/60 pt-4">
            <Text className="text-sm font-bold text-navy-900">Requests you have made</Text>
            {requestList.length === 0 ? (
              <Text className="mt-1 text-xs leading-relaxed text-text-secondary">
                You have not asked for anything yet. Requests you make will be listed here with their progress.
              </Text>
            ) : (
              <View className="mt-2.5 divide-y divide-line/60">
                {requestList.map((item) => (
                  <View key={item.id} className="flex-row items-center justify-between py-2.5">
                    <View>
                      <Text className="text-xs font-bold text-navy-900">
                        {item.kind === "ERASURE" ? "Deletion request" : "Data export request"}
                      </Text>
                      <Text className="text-[10px] text-text-muted">{item.requested_at}</Text>
                    </View>
                    <Badge tone={item.status === "COMPLETED" ? "success" : "neutral"}>
                      {item.status}
                    </Badge>
                  </View>
                ))}
              </View>
            )}
          </View>

          {create.error ? (
            <Text className="mt-3 text-xs text-danger-text">
              {describeError(create.error, "mutation").message}
            </Text>
          ) : null}
        </View>

        {/* Confirmation Dialog for Erasure */}
        <ConfirmAction
          open={confirmingErasure}
          onOpenChange={setConfirmingErasure}
          title="Delete your account data?"
          consequence="We will review the request. Records required by law stay until their statutory period expires."
          confirmLabel="Send delete request"
          pending={create.isPending}
          destructive
          onConfirm={() =>
            create.mutate("ERASURE", {
              onSuccess: () => {
                setConfirmingErasure(false);
                void requests.refetch();
              },
            })
          }
        />

        {/* Confirmation Dialog for Access */}
        <ConfirmAction
          open={confirmingAccess}
          onOpenChange={setConfirmingAccess}
          title="Request a copy of your data?"
          consequence="We will prepare an export of all data held against your account and send it to your email."
          confirmLabel="Request export"
          pending={create.isPending}
          onConfirm={() =>
            create.mutate("ACCESS", {
              onSuccess: () => {
                setConfirmingAccess(false);
                void requests.refetch();
              },
            })
          }
        />
      </View>
    </AccountPageShell>
  );
}
