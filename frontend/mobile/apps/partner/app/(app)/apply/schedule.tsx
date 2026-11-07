import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { ScheduleStep } from "@/features/application/view/schedule-step";

export default function SchedulePage() {
  return (
    <View className="gap-5 px-4 py-4">
      <View className="gap-1 border-b border-line pb-4">
        <Text className="text-xl font-extrabold text-navy-900">Working Hours & Availability</Text>
        <Text className="text-sm text-text-secondary">
          Set your weekly working hours. You will only receive customer bookings during your active shifts.
        </Text>
      </View>
      <ScheduleStep />
    </View>
  );
}
