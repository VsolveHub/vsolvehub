// Ported from frontend/apps/customer/features/bookings/view/booking-visit-screen.tsx
import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBookingGroup } from "@/features/bookings/queries";
import { useVisit } from "@/features/visit/queries";
import { VisitPanel } from "@/features/visit/view/visit-panel";
import { VisitStatusBadge } from "@/features/visit/view/visit-status";

export function BookingVisit({ groupId, bookingId }: { groupId: string; bookingId: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const groupQuery = useBookingGroup(groupId);
  const visitQuery = useVisit(bookingId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([groupQuery.refetch(), visitQuery.refetch()]);
    setRefreshing(false);
  };

  const group = groupQuery.data;
  const unitIndex =
    group?.units.findIndex((unit) => unit.booking_id === bookingId) ?? -1;
  const visitPosition = unitIndex >= 0 ? unitIndex + 1 : null;
  const visitTotal = group?.units.length ?? null;

  const heading =
    visitPosition !== null && visitTotal !== null && visitTotal > 1
      ? `Visit ${visitPosition} of ${visitTotal}`
      : "Your visit";

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingTop: Math.max(insets.top + 14, 32),
        paddingBottom: Math.max(insets.bottom + 24, 36),
        paddingHorizontal: 16,
      }}
      contentContainerClassName="gap-4"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to booking"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push(`/bookings/${groupId}` as never);
            }
          }}
          className="size-12 items-center justify-center rounded-full border border-line bg-surface shadow-sm active:bg-surface-hover"
        >
          <ChevronLeft size={22} color="#00112e" />
        </Pressable>
        <Text className="min-w-0 flex-1 text-2xl font-extrabold tracking-tight text-text">{heading}</Text>
        {visitQuery.data ? <VisitStatusBadge status={visitQuery.data.status} /> : null}
      </View>

      <VisitPanel bookingId={bookingId} groupId={groupId} />
    </ScrollView>
  );
}
