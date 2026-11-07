// Ported from frontend/apps/partner/features/work-stack/view/waiting-radar.tsx
import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

export function WaitingRadar({ isOnline }: { readonly isOnline: boolean }) {
  return (
    <View className="items-center justify-center gap-5 py-8">
      <View
        className={
          isOnline
            ? "h-16 w-16 items-center justify-center rounded-full bg-success-text"
            : "h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-line bg-surface-sunken"
        }
      />
      <View className="items-center gap-1">
        <Text className="text-base font-bold text-text">
          {isOnline ? "Searching for jobs nearby" : "You are offline"}
        </Text>
        <Text className="text-center text-sm leading-relaxed text-text-secondary">
          {isOnline ? "We will notify you the moment a job comes in." : "Go online above to start receiving offers."}
        </Text>
      </View>
    </View>
  );
}
