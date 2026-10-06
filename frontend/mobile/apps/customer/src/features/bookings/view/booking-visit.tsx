// Ported from frontend/apps/customer/features/bookings/view/booking-visit-screen.tsx
import { Spinner, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { useBookingGroup } from "@/features/bookings/queries";
import { RatingForm } from "@/features/ratings/view/rating-form";

export function BookingVisit({ groupId, bookingId }: { groupId: string; bookingId: string }) {
  const group = useBookingGroup(groupId);
  if (group.isPending) return <Spinner size="sm" />;
  const units = group.data?.units ?? [];
  const index = units.findIndex((unit) => unit.booking_id === bookingId);
  const unit = index >= 0 ? units[index] : null;
  return (
    <View className="flex-1 gap-3 bg-canvas px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">{unit ? `Visit ${index + 1} of ${units.length}` : "Visit"}</Text>
      {unit ? <Text className="text-sm text-text-secondary">{unit.starts_at}</Text> : null}
      {unit?.lines.map((line) => (
        <Text key={line.id} className="text-base text-text">
          {line.label}
        </Text>
      ))}
      <RatingForm subject="booking" id={bookingId} />
    </View>
  );
}
