import { Button, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cancelRide, rideKey, useRide, type Ride } from "../queries";
import { RIDER_CANCEL_REASONS, canRiderCancel, cancelledText, etaText, rideStage } from "../ride-stage";
import { RideMap } from "./RideMap";
import { CaptainCard, RateCaptain, SafetyRow, StartCode, TripSummary } from "./ride-parts";

/**
 * The rider's live ride (brief §5.11): searching, the captain moving on the map with the ETA and
 * start code, the trip, then what to pay and the rating. Call, Share and SOS while it is live.
 */
export function RideScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { rideId, from } = useLocalSearchParams<{ rideId: string; from?: string }>();
  // Opened from Your rides: Done goes back to the list, not Home.
  const done = () => (from === "history" ? router.back() : router.replace("/"));
  const ride = useRide(rideId);
  const [choosingReason, setChoosingReason] = useState(false);
  const cancel = useMutation({
    mutationFn: (reason: string) => cancelRide(rideId, reason),
    onSuccess: (cancelled) => queryClient.setQueryData(rideKey(rideId), cancelled),
  });

  if (ride.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }
  if (ride.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-4">
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

  const live = stage === "coming" || stage === "arrived" || stage === "in_trip";
  const onRated = (stars: number) =>
    queryClient.setQueryData<Ride>(rideKey(rideId), (old) => (old ? { ...old, my_rating: stars } : old));

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
    detail = etaText(data.captain?.eta_s);
  } else if (stage === "arrived") {
    headline = `${captainName} has arrived`;
    detail = "Meet your captain at the pickup and share your start code.";
  } else if (stage === "in_trip") {
    headline = "On your way";
  } else if (stage === "pay") {
    headline = `Pay ${formatMoney(data.final_fare_paise ?? data.fare_paise)} to your captain`;
    detail = "Cash or UPI, straight to your captain.";
  } else {
    headline = "Ride cancelled";
    detail = cancelledText(data.cancelled_by);
  }

  const showMap = live || stage === "searching";
  return (
    <View className="flex-1 bg-canvas">
      {showMap ? (
        <View className="mx-4 mt-2 min-h-40 flex-1 overflow-hidden rounded-2xl border border-line">
          <RideMap ride={data} />
        </View>
      ) : null}
      <ScrollView
        className={showMap ? "max-h-[58%] grow-0" : "flex-1"}
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 12 }}
      >
        <View className="gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-xl font-extrabold text-text">{headline}</Text>
            {stage === "searching" ? <ActivityIndicator color="#2563EB" /> : null}
          </View>
          {detail ? <Text className="text-sm text-text-muted">{detail}</Text> : null}
        </View>

        {live ? <CaptainCard ride={data} /> : null}
        {(stage === "coming" || stage === "arrived") && data.otp ? <StartCode code={data.otp} /> : null}
        {live ? <SafetyRow ride={data} /> : null}

        {stage === "pay" && data.captain ? (
          data.my_rating == null ? (
            <RateCaptain ride={data} onRated={onRated} />
          ) : (
            <Text className="text-center text-base text-slate-600">Thanks for rating your ride.</Text>
          )
        ) : null}

        <TripSummary ride={data} />

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
          <Button variant="ghost" block onPress={done}>
            Done
          </Button>
        ) : null}
      </ScrollView>
    </View>
  );
}
