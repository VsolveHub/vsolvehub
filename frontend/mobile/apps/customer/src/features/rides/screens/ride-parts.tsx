import { useMutation } from "@tanstack/react-query";
import { Button, Text } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { Star } from "lucide-react-native";
import { useState } from "react";
import { Alert, Linking, Pressable, Share, View } from "react-native";

import { rateCaptain, raiseRiderSos, type Place, type Ride } from "../queries";
import { firstName, shareTripText } from "../ride-stage";
import { VEHICLES } from "../vehicles";

/** Photo, name, rating and vehicle: the rider always sees these before the trip (brief §5.9). */
export function CaptainCard({ ride }: { ride: Ride }) {
  const captain = ride.captain;
  if (!captain) return null;
  const vehicle = captain.vehicle;
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-slate-100 p-4">
      {captain.photo_url ? (
        <Image
          source={{ uri: captain.photo_url }}
          accessibilityLabel={`Photo of ${captain.name}`}
          style={{ width: 56, height: 56, borderRadius: 28 }}
        />
      ) : (
        <View className="h-14 w-14 items-center justify-center rounded-full bg-blue-100">
          <Text className="text-xl font-bold text-blue-700">{captain.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View className="flex-1 gap-0.5">
        <Text className="text-lg font-bold text-slate-900">
          {captain.name}
          {captain.rating != null ? `  ★ ${captain.rating.toFixed(1)}` : "  · New captain"}
        </Text>
        <Text className="text-base font-semibold text-slate-900">{vehicle.registration_number}</Text>
        <Text className="text-sm text-slate-600">
          {VEHICLES[vehicle.vehicle_type]?.name ?? vehicle.vehicle_type} · {vehicle.make_model}, {vehicle.colour}
        </Text>
      </View>
    </View>
  );
}

export function StartCode({ code }: { code: string }) {
  return (
    <View className="items-center gap-1 rounded-2xl border-2 border-dashed border-blue-600 p-4">
      <Text className="text-xs font-semibold uppercase text-blue-700">Your start code</Text>
      <Text
        accessibilityLabel={`Start code ${code.split("").join(" ")}`}
        className="text-4xl font-extrabold tracking-[0.3em] text-slate-900"
      >
        {code}
      </Text>
      <Text className="text-xs text-slate-500">Tell it to your captain when you meet. Never share it before.</Text>
    </View>
  );
}

/** The phone's last known place, only if location is already allowed. Never asks, never waits. */
async function lastKnownPlace(): Promise<Place | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const last = await Location.getLastKnownPositionAsync();
    return last ? { latitude: last.coords.latitude, longitude: last.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** Call the captain, share the trip, and SOS. Call shows only while the server sends the number. */
export function SafetyRow({ ride }: { ride: Ride }) {
  const phone = ride.captain?.phone_number ?? null;
  const sos = useMutation({
    mutationFn: async () => raiseRiderSos(ride.id, await lastKnownPlace()),
    onSuccess: (answer) =>
      Alert.alert("SOS sent", "VSolve support has been alerted.", [
        { text: `Call ${answer.emergency_number}`, onPress: () => void Linking.openURL(`tel:${answer.emergency_number}`) },
        { text: "Close", style: "cancel" },
      ]),
    onError: (error) =>
      Alert.alert("SOS not sent", describeError(error, "mutation").message, [
        { text: `Call ${ride.emergency_number}`, onPress: () => void Linking.openURL(`tel:${ride.emergency_number}`) },
        { text: "Close", style: "cancel" },
      ]),
  });

  return (
    <View className="flex-row gap-2">
      {phone && ride.captain ? (
        <Button variant="outline" className="flex-1" onPress={() => void Linking.openURL(`tel:${phone}`)}>
          Call {firstName(ride.captain.name)}
        </Button>
      ) : null}
      <Button variant="outline" className="flex-1" onPress={() => void Share.share({ message: shareTripText(ride) })}>
        Share
      </Button>
      <Button
        variant="outline"
        className="flex-1"
        loading={sos.isPending}
        onPress={() =>
          Alert.alert("Send SOS?", "VSolve support will be alerted at once.", [
            { text: "Cancel", style: "cancel" },
            { text: "Send SOS", style: "destructive", onPress: () => sos.mutate() },
          ])
        }
      >
        SOS
      </Button>
    </View>
  );
}

/** 1–5 stars for the captain after the trip. The rider can skip; it is asked only once. */
export function RateCaptain({ ride, onRated }: { ride: Ride; onRated: (stars: number) => void }) {
  const [stars, setStars] = useState(0);
  const rate = useMutation({ mutationFn: () => rateCaptain(ride.id, stars), onSuccess: () => onRated(stars) });
  const name = ride.captain ? firstName(ride.captain.name) : "your captain";

  return (
    <View className="items-center gap-3 rounded-2xl border border-slate-200 p-4">
      <Text className="text-base font-semibold text-slate-900">How was your ride with {name}?</Text>
      <View className="flex-row gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`}
            hitSlop={6}
            onPress={() => setStars(value)}
          >
            <Star size={36} color="#f87000" fill={value <= stars ? "#f87000" : "transparent"} />
          </Pressable>
        ))}
      </View>
      {rate.isError ? (
        <Text accessibilityRole="alert" className="text-sm text-red-600">
          {describeError(rate.error, "mutation").message}
        </Text>
      ) : null}
      <Button size="lg" block disabled={stars === 0} loading={rate.isPending} onPress={() => rate.mutate()}>
        Submit rating
      </Button>
    </View>
  );
}
