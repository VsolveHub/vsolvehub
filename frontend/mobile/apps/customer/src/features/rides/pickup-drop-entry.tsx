import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronRight, Package } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useHomeAvailability } from "./use-home-availability";
import { useLandOnOpenRide } from "./use-land-on-open-ride";

/**
 * The one Pick up & Drop card on Home, for a signed-in customer. It replaces the separate Rides
 * and Pick up & Drop cards (owner change, 24 Nov): a ride and a parcel are both inside it.
 *
 * It shows where the server says a ride or a parcel can be booked (D21). Where that is not known
 * yet, it stays; location is asked for on the next screen. When only one of the two runs here, the
 * card goes straight to it; when both do, it asks which. The open-ride check runs either way, so a
 * ride still going is found.
 */
export function PickupDropEntry() {
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.status) === "signedIn";
  useLandOnOpenRide();
  const { rides, parcel } = useHomeAvailability(signedIn);
  if (!signedIn || (!rides && !parcel)) return null;

  const open = () => {
    const route = rides && parcel ? "/rides/start" : rides ? "/rides" : "/rides/parcel";
    router.push(route as never);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Pick up and Drop"
      onPress={open}
      className="min-h-touch flex-row items-center gap-4 rounded-card border border-line bg-surface p-4 active:bg-surface-hover"
    >
      <View className="h-14 w-14 items-center justify-center rounded-full bg-action-surface">
        <Package size={30} color="#f87000" />
      </View>
      <View className="flex-1">
        <Text className="text-lg font-extrabold text-text">Pick up &amp; Drop</Text>
        <Text className="text-sm text-text-muted">Rides and parcels</Text>
      </View>
      <ChevronRight size={20} color="#756c5e" />
    </Pressable>
  );
}
