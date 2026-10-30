import { Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBookingGroup } from "@/features/bookings/queries";
import { RatingForm } from "@/features/ratings/view/rating-form";

export function BookingVisit({ groupId, bookingId }: { groupId: string; bookingId: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const group = useBookingGroup(groupId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await group.refetch();
    setRefreshing(false);
  };

  if (group.isPending) return <Spinner size="sm" />;
  const units = group.data?.units ?? [];
  const index = units.findIndex((unit) => unit.booking_id === bookingId);
  const unit = index >= 0 ? units[index] : null;
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingTop: Math.max(insets.top + 14, 32),
        paddingBottom: Math.max(insets.bottom + 24, 36),
        paddingHorizontal: 16,
      }}
      contentContainerClassName="gap-3"
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
        <Text className="text-xs font-bold text-navy-900">Back to Booking</Text>
      </Pressable>
      <Text className="text-2xl font-extrabold text-text">{unit ? `Visit ${index + 1} of ${units.length}` : "Visit"}</Text>
      {unit ? <Text className="text-sm text-text-secondary">{unit.starts_at}</Text> : null}
      {unit?.lines.map((line) => (
        <Text key={line.id} className="text-base text-text">
          {line.label}
        </Text>
      ))}
      <RatingForm subject="booking" id={bookingId} />
    </ScrollView>
  );
}
