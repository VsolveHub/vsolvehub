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
        className="mb-1 flex-row items-center gap-1.5 self-start rounded-full border border-line bg-surface px-3 py-1.5 shadow-2xs active:bg-surface-hover"
      >
        <ChevronLeft size={16} color="#00112e" />
        <Text className="text-xs font-bold text-navy-900">Back to this booking</Text>
      </Pressable>

      <View>
        <Text className="text-2xl font-bold text-text">{heading}</Text>
      </View>

      <VisitPanel bookingId={bookingId} groupId={groupId} />
    </ScrollView>
  );
}
