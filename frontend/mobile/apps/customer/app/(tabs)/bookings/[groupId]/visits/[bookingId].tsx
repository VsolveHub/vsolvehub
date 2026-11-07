import { useLocalSearchParams } from "expo-router";

import { BookingVisit } from "@/features/bookings/view/booking-visit";

export default function Screen() {
  const { bookingId, groupId } = useLocalSearchParams<{ bookingId: string; groupId: string }>();
  return <BookingVisit groupId={groupId} bookingId={bookingId} />;
}
