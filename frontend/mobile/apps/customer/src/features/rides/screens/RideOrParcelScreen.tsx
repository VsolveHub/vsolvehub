import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronRight, Package } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useHomeAvailability } from "../use-home-availability";
import { VEHICLES, type VehicleType } from "../vehicles";

/** Every vehicle Rides offers, cheapest first. Which ones run at the pickup is told on booking. */
const TYPES: VehicleType[] = ["BIKE", "AUTO", "CAB"];

const CARD =
  "min-h-touch flex-row items-center gap-4 rounded-card border border-line bg-surface p-4 active:bg-surface-hover";

/**
 * Pick up & Drop: a ride or a parcel? Home opens this only where both run (D21); where only one
 * does, Home goes straight to it. An option the server says is not available here is not shown.
 */
export function RideOrParcelScreen() {
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.status) === "signedIn";
  const { rides, parcel } = useHomeAvailability(signedIn);

  return (
    <View className="flex-1 gap-3 bg-canvas p-4">
      {rides ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Book a ride"
          onPress={() => router.push("/rides" as never)}
          className={CARD}
        >
          <View className="flex-row -space-x-3">
            {TYPES.map((type) => {
              const Icon = VEHICLES[type].icon;
              return (
                <View key={type} className="h-14 w-14 items-center justify-center rounded-full border-2 border-surface bg-surface-sunken">
                  <Icon size={40} />
                </View>
              );
            })}
          </View>
          <View className="flex-1">
            <Text className="text-lg font-extrabold text-text">Ride</Text>
            <Text className="text-sm text-text-muted">{TYPES.map((type) => VEHICLES[type].name).join(" · ")}</Text>
          </View>
          <ChevronRight size={20} color="#756c5e" />
        </Pressable>
      ) : null}
      {parcel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send a parcel"
          onPress={() => router.push("/rides/parcel" as never)}
          className={CARD}
        >
          <View className="h-14 w-14 items-center justify-center rounded-full bg-action-surface">
            <Package size={30} color="#f87000" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-extrabold text-text">Parcel</Text>
            <Text className="text-sm text-text-muted">Send or get a parcel · Bike or Auto</Text>
          </View>
          <ChevronRight size={20} color="#756c5e" />
        </Pressable>
      ) : null}
    </View>
  );
}
