// Ported from frontend/apps/customer/features/account/view/communication-preferences.tsx
// Exact match with Image 1 (Messages tab)
import { describeError } from "@vsolve/query/native";
import { Badge, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";

import { useCommunicationPreferences, useSetCommunicationPreference } from "@/features/account/queries";
import { AccountPageShell } from "./account-page-shell";

const PURPOSE_COPY: Record<string, { label: string; description: string }> = {
  "booking-updates": {
    label: "Booking updates",
    description: "Confirmations, technician assignment and arrival messages.",
  },
  "assisted-booking": {
    label: "Assisted booking",
    description: "Messages about bookings an agent makes with you on a call.",
  },
  marketing: {
    label: "Offers and promotions",
    description: "Discounts and new services. Never about a booking in progress.",
  },
  reminders: {
    label: "Reminders",
    description: "Nudges before a visit and when a service is due again.",
  },
};

function humanise(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function MessagesScreen() {
  const preferences = useCommunicationPreferences();
  const update = useSetCommunicationPreference();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await preferences.refetch();
    setRefreshing(false);
  };

  if (preferences.isPending) {
    return (
      <AccountPageShell activeTab="messages" onRefresh={onRefresh} refreshing={refreshing}>
        <View className="items-center justify-center py-12">
          <Spinner size="sm" />
        </View>
      </AccountPageShell>
    );
  }

  if (preferences.isError) {
    return (
      <AccountPageShell activeTab="messages" onRefresh={onRefresh} refreshing={refreshing}>
        <ErrorState
          title="We could not load your message settings"
          message={describeError(preferences.error, "read").message}
          actionLabel="Try again"
          onAction={() => void preferences.refetch()}
        />
      </AccountPageShell>
    );
  }

  const rows = preferences.data ?? [];

  return (
    <AccountPageShell activeTab="messages" onRefresh={onRefresh} refreshing={refreshing}>
      <View className="overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-xs">
        {/* Section Header */}
        <Text className="text-xl font-extrabold tracking-tight text-navy-950">Messages</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Choose what we send you, and where it goes.
        </Text>

        {rows.length === 0 ? (
          /* Empty State matching Image 1 */
          <View className="mt-5 items-center justify-center rounded-2xl border border-dashed border-[#d3ccc0] bg-white px-6 py-8">
            <Text className="text-center text-base font-extrabold text-navy-900">
              No message settings yet
            </Text>
            <Text className="mt-2.5 max-w-xs text-center text-sm leading-relaxed text-text-secondary">
              Nothing has been set for this account. Messages about a booking in progress — confirmation, who is coming, when they arrive — are part of the service and are always sent.
            </Text>
          </View>
        ) : (
          <View className="mt-4 divide-y divide-line/60">
            {rows.map((row) => {
              const copy = PURPOSE_COPY[row.purpose];
              const label = copy?.label ?? humanise(row.purpose);
              return (
                <View
                  key={`${row.channel}:${row.purpose}`}
                  className="flex-row items-start justify-between gap-4 py-4"
                >
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-semibold text-navy-900">{label}</Text>
                      <Badge>{row.channel}</Badge>
                    </View>
                    {copy ? (
                      <Text className="mt-0.5 text-xs text-text-secondary">{copy.description}</Text>
                    ) : null}
                  </View>
                  <Switch
                    value={row.is_enabled}
                    onValueChange={(checked: boolean) =>
                      update.mutate({
                        channel: row.channel,
                        purpose: row.purpose,
                        isEnabled: checked,
                      })
                    }
                  />
                </View>
              );
            })}
          </View>
        )}

        {update.error ? (
          <Text className="mt-3 text-xs text-danger-text">
            {describeError(update.error, "mutation").message}
          </Text>
        ) : null}
      </View>
    </AccountPageShell>
  );
}
