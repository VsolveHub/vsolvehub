import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronRight, Package } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useHomeAvailability } from "./use-home-availability";

/**
 * The Pick up & Drop card on Home, next to Rides: shown only where the server says a parcel can be
 * booked (D21). Switching it off in Operations (deactivating the parcel cards) hides it here.
 */
export function PickupDropEntry() {
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.status) === "signedIn";
  const { parcel } = useHomeAvailability(signedIn);
  if (!signedIn || !parcel) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Pick up and Drop"
      onPress={() => router.push("/rides/parcel" as never)}
      className="min-h-touch flex-row items-center gap-4 rounded-card border border-line bg-surface p-4 active:bg-surface-hover"
    >
      <View className="h-14 w-14 items-center justify-center rounded-full bg-action-surface">
        <Package size={30} color="#f87000" />
      </View>
      <View className="flex-1">
        <Text className="text-lg font-extrabold text-text">Pick up &amp; Drop</Text>
        <Text className="text-sm text-text-muted">Send or get a parcel · Bike or Auto</Text>
      </View>
      <ChevronRight size={20} color="#756c5e" />
    </Pressable>
  );
}
