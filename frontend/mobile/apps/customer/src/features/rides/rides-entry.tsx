import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { findOpenRide, useRidesAvailability, type Place } from "./queries";
import { VEHICLES } from "./vehicles";

/**
 * Where the phone is, only if the customer already allowed location. Home never asks for the
 * permission: a customer who has not allowed it simply does not see the Rides entry.
 */
function useAllowedPlace(): Place | null {
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) return;
        const position =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!cancelled) {
          setPlace({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        }
      } catch {
        // No position: no entry. Never a card that leads nowhere.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return place;
}

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
 * The Rides card on Home (brief §5.11). Shown only when `rides/availability/` lists vehicle types
 * here; while loading, on any error, or where Rides does not run, it renders nothing.
 */
export function RidesEntry() {
  const router = useRouter();
  useLandOnOpenRide();
  const availability = useRidesAvailability(useAllowedPlace());
  const types = availability.data?.vehicle_types ?? [];
  if (types.length === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Book a ride"
      onPress={() => router.push("/rides" as never)}
      className="flex-row items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <View className="flex-row -space-x-2">
        {types.map((type) => {
          const Icon = VEHICLES[type].icon;
          return (
            <View key={type} className="h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-slate-100">
              <Icon size={22} color="#0F172A" />
            </View>
          );
        })}
      </View>
      <View className="flex-1">
        <Text className="text-base font-extrabold text-[#00112e]">Rides</Text>
        <Text className="text-sm text-slate-500">
          {types.map((type) => VEHICLES[type].name).join(" · ")} near you
        </Text>
      </View>
      <ChevronRight size={20} color="#64748B" />
    </Pressable>
  );
}
