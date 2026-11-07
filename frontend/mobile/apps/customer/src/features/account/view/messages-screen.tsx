// Ported from frontend/apps/customer/features/account/view/communication-preferences.tsx
// Exact match with Image 1 (Messages tab)
import { describeError } from "@vsolve/query/native";
import { Badge, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

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

export function MessagesScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const preferences = useCommunicationPreferences();
  const update = useSetCommunicationPreference();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await preferences.refetch();
    setRefreshing(false);
  };

  if (preferences.isPending) {
    const loadingView = (
      <View className="items-center justify-center py-12">
        <Spinner size="sm" />
      </View>
    );
    if (embedded) return loadingView;
    return (
      <AccountPageShell activeTab="messages" onRefresh={onRefresh} refreshing={refreshing}>
        {loadingView}
      </AccountPageShell>
    );
  }

  if (preferences.isError) {
    const errorView = (
      <ErrorState
        title="We could not load your message settings"
        message={describeError(preferences.error, "read").message}
        actionLabel="Try again"
        onAction={() => void preferences.refetch()}
      />
    );
    if (embedded) return errorView;
    return (
      <AccountPageShell activeTab="messages" onRefresh={onRefresh} refreshing={refreshing}>
        {errorView}
      </AccountPageShell>
    );
  }

  const rows = preferences.data ?? [];

  const content = (
    <View className="overflow-hidden rounded-3xl border border-[#e7e2da]/80 bg-white p-6 shadow-xs">
        {/* Section Header */}
        <Text className="text-xl font-bold tracking-tight text-navy-950">Messages</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Choose what we send you, and where it goes.
        </Text>

        {rows.length === 0 ? (
          /* Empty State matching Image exactly */
          <View className="mt-6 items-center justify-center rounded-2xl border border-dashed border-[#d3ccc0] bg-white px-6 py-10">
            <Svg width={52} height={52} viewBox="0 0 48 48" fill="none">
              {/* Rays radiating upwards */}
              <Path
                d="M24 4V8"
                stroke="#475569"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <Path
                d="M16.5 6L18.5 9.5"
                stroke="#475569"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <Path
                d="M31.5 6L29.5 9.5"
                stroke="#475569"
                strokeWidth={2}
                strokeLinecap="round"
              />
              {/* Document */}
              <Rect
                x={15}
                y={13}
                width={18}
                height={15}
                rx={1.5}
                stroke="#475569"
                strokeWidth={2}
              />
              <Path
                d="M19 18H29"
                stroke="#475569"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
              <Path
                d="M19 22H26"
                stroke="#475569"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
              {/* Inbox Tray */}
              <Path
                d="M11 23V33C11 35 12.5 36.5 14.5 36.5H33.5C35.5 36.5 37 35 37 33V23H31L28.5 27.5H19.5L17 23H11Z"
                stroke="#475569"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </Svg>

            <Text className="mt-4 text-center text-[17px] font-bold text-navy-900">
              No message settings yet
            </Text>
            <Text className="mt-2.5 max-w-[290px] text-center text-[13.5px] leading-[21px] text-[#64748B]">
              Nothing has been set for this account.{"\n"}
              Messages about a booking in progress —{"\n"}
              confirmation, who is coming, when they arrive —{"\n"}
              — are part of the service and are always sent.
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
  );

  if (embedded) {
    return content;
  }

  return (
    <AccountPageShell activeTab="messages" onRefresh={onRefresh} refreshing={refreshing}>
      {content}
    </AccountPageShell>
  );
}
