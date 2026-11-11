import { Button, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { cancelRide, rideKey, useRide, type Ride } from "../queries";
import { RIDER_CANCEL_REASONS, canRiderCancel, cancelledText, rideStage } from "../ride-stage";
import { VEHICLES } from "../vehicles";

function CaptainCard({ ride }: { ride: Ride }) {
  const captain = ride.captain;
  if (!captain) return null;
  const vehicle = captain.vehicle;
  return (
    <View className="gap-1 rounded-2xl bg-slate-100 p-4">
      <Text className="text-lg font-bold text-slate-900">{captain.name}</Text>
      <Text className="text-base font-semibold text-slate-900">{vehicle.registration_number}</Text>
      <Text className="text-sm text-slate-600">
        {VEHICLES[vehicle.vehicle_type]?.name ?? vehicle.vehicle_type} · {vehicle.make_model}, {vehicle.colour}
      </Text>
    </View>
  );
}

function StartCode({ code }: { code: string }) {
  return (
    <View className="items-center gap-1 rounded-2xl border-2 border-dashed border-blue-600 p-4">
      <Text className="text-xs font-semibold uppercase text-blue-700">Your start code</Text>
      <Text accessibilityLabel={`Start code ${code.split("").join(" ")}`} className="text-4xl font-extrabold tracking-[0.3em] text-slate-900">
        {code}
      </Text>
      <Text className="text-xs text-slate-500">Tell it to your captain when you meet. Never share it before.</Text>
    </View>
  );
}

/**
 * The rider's live ride: searching, the captain and the start code, the trip, then what to pay.
 * The map, ETA, call, share, SOS and rating are added on Day 8.
 */
export function RideScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const ride = useRide(rideId);
  const [choosingReason, setChoosingReason] = useState(false);
  const cancel = useMutation({
    mutationFn: (reason: string) => cancelRide(rideId, reason),
    onSuccess: (cancelled) => queryClient.setQueryData(rideKey(rideId), cancelled),
  });

  if (ride.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }
  if (ride.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white p-6">
        <Text className="text-center text-slate-700">{describeError(ride.error, "read").message}</Text>
        <Button onPress={() => void ride.refetch()}>Try again</Button>
      </View>
    );
  }

  const data = ride.data;
  const stage = rideStage(data.state);
  const captainName = data.captain?.name ?? "Your captain";
  const tryAgain = () =>
    router.replace({
      pathname: "/rides/choose-ride",
      params: {
        pickupLat: data.pickup.latitude,
        pickupLng: data.pickup.longitude,
        pickupLabel: data.pickup.address,
        dropLat: data.drop.latitude,
        dropLng: data.drop.longitude,
        dropLabel: data.drop.address,
      },
    } as never);

  let headline: string;
  let detail: string | null = null;
  if (stage === "searching") {
    headline = data.searching_again ? "Finding another captain…" : "Finding your captain…";
    detail = data.searching_again ? "Your captain had to cancel. We're finding you another one." : null;
  } else if (stage === "no_captain") {
    headline = "No captain nearby";
    detail = "Every captain near you is busy right now.";
  } else if (stage === "coming") {
    headline = `${captainName} is on the way`;
  } else if (stage === "arrived") {
    headline = `${captainName} has arrived`;
    detail = "Meet your captain at the pickup and share your start code.";
  } else if (stage === "in_trip") {
    headline = "On your way";
    detail = `To ${data.drop.address}`;
  } else if (stage === "pay") {
    headline = `Pay ${formatMoney(data.final_fare_paise ?? data.fare_paise)} to your captain`;
    detail = "Cash or UPI, straight to your captain.";
  } else {
    headline = "Ride cancelled";
    detail = cancelledText(data.cancelled_by);
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="gap-2">
        <Text className="text-2xl font-extrabold text-slate-900">{headline}</Text>
        {detail ? <Text className="text-base text-slate-600">{detail}</Text> : null}
        {stage === "searching" ? <ActivityIndicator color="#2563EB" /> : null}
      </View>

      {stage === "coming" || stage === "arrived" || stage === "in_trip" ? <CaptainCard ride={data} /> : null}
      {(stage === "coming" || stage === "arrived") && data.otp ? <StartCode code={data.otp} /> : null}

      <View className="gap-1 rounded-2xl border border-slate-200 p-4">
        <Text className="text-sm text-slate-900">From: {data.pickup.address}</Text>
        <Text className="text-sm text-slate-900">To: {data.drop.address}</Text>
        <Text className="text-sm text-slate-600">Fare {formatMoney(data.fare_paise)} · cash or UPI to the captain</Text>
      </View>

      {cancel.isError ? (
        <Text accessibilityRole="alert" className="text-sm text-red-600">
          {describeError(cancel.error, "mutation").message}
        </Text>
      ) : null}

      {canRiderCancel(stage) ? (
        choosingReason ? (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-slate-900">Why are you cancelling?</Text>
            {RIDER_CANCEL_REASONS.map(({ code, label }) => (
              <Button key={code} variant="outline" block disabled={cancel.isPending} onPress={() => cancel.mutate(code)}>
                {label}
              </Button>
            ))}
          </View>
        ) : (
          <Button variant="outline" block onPress={() => setChoosingReason(true)}>
            Cancel ride
          </Button>
        )
      ) : null}

      {stage === "no_captain" ? (
        <Button size="lg" block onPress={tryAgain}>
          Try again
        </Button>
      ) : null}
      {stage === "pay" || stage === "cancelled" || stage === "no_captain" ? (
        <Button variant="ghost" block onPress={() => router.replace("/")}>
          Done
        </Button>
      ) : null}
    </ScrollView>
  );
}
