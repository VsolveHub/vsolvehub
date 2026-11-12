import { useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BatteryHelp } from "@/features/rides/view/battery-help";

export default function RidesBatteryHelpRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
    >
      <BatteryHelp onDone={() => router.back()} />
    </ScrollView>
  );
}
