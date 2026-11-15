import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";

import { findOpenRide } from "./queries";
import { VEHICLES, type VehicleType } from "./vehicles";

/** Every vehicle Rides offers, cheapest first. Which ones run at the pickup is told on booking. */
const TYPES: VehicleType[] = ["BIKE", "AUTO", "CAB"];

/** Once per app launch, so going back to Home from the ride screen doesn't bounce the rider. */
let openRideChecked = false;

/**
 * Reopening the app lands on the ride still going (brief §5.11, item 9). Home is where the app
 * opens, so the check lives in its Rides card. A failed check is tried again on the next visit.
 */
function useLandOnOpenRide() {
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.status) === "signedIn";

  useEffect(() => {
    if (!signedIn || openRideChecked) return;
    let cancelled = false;
    findOpenRide()
      .then((rideId) => {
        openRideChecked = true;
        if (rideId && !cancelled) router.push(`/rides/ride/${rideId}` as never);
      })
      .catch(() => {
        // Offline or the server is down: Home stays as it is.
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, router]);
}

/** For tests: forget that this launch already checked. */
export function resetOpenRideCheck() {
  openRideChecked = false;
}

/**
 * The Rides card on Home: always there for a signed-in customer, like the "Where to?" bar of a
 * ride app. Location is asked for on the next screen, and a pickup where Rides does not run is
 * told so there ("Rides isn't available here yet"), not hidden here.
 */
export function RidesEntry() {
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.status) === "signedIn";
  useLandOnOpenRide();
  if (!signedIn) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Book a ride"
      onPress={() => router.push("/rides" as never)}
      className="min-h-touch flex-row items-center gap-4 rounded-card border border-line bg-surface p-4 active:bg-surface-hover"
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
        <Text className="text-lg font-extrabold text-text">Rides</Text>
        <Text className="text-sm text-text-muted">
          {TYPES.map((type) => VEHICLES[type].name).join(" · ")}
        </Text>
      </View>
      <ChevronRight size={20} color="#756c5e" />
    </Pressable>
  );
}
