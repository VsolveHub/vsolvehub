import { isApiRequestError } from "@vsolve/api-client";
import { Button, Input, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Star } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isInAppMapAvailable } from "@/features/work/route";

import {
  CAPTAIN_CANCEL_REASONS,
  firstName,
  isOtpComplete,
  navigationUrl,
  tripStep,
} from "../model/trip";
import {
  cancelAsCaptain,
  captainStatusKey,
  completeTrip,
  currentRideKey,
  markArrived,
  markPaymentReceived,
  raiseCaptainSos,
  rateRider,
  startTrip,
  useCurrentRide,
  type CaptainRide,
} from "../queries";

function errorText(error: unknown): string {
  if (isApiRequestError(error) && error.code === "otp_invalid") {
    const left = (error.details as { attempts_left?: number } | null)?.attempts_left;
    return typeof left === "number" ? `That code is wrong. ${left} ${left === 1 ? "try" : "tries"} left.` : error.message;
  }
  return describeError(error, "mutation").message;
}

function Place({ label, address }: { label: string; address: string }) {
  return (
    <View className="gap-0.5 rounded-2xl border border-line bg-surface p-4">
      <Text className="text-xs font-semibold uppercase text-text-muted">{label}</Text>
      <Text className="text-base text-text">{address}</Text>
    </View>
  );
}

/**
 * The pickup or drop on a map, with the captain's own dot, filling the top of the screen. Shown
 * only when this build can draw maps (`isInAppMapAvailable`): an Android build without the Maps
 * key would show an empty grey square, so then the panel takes the whole screen.
 */
function TripMap({ latitude, longitude }: { latitude: string; longitude: string }) {
  const point = { latitude: Number(latitude), longitude: Number(longitude) };
  return (
    <MapView
      style={{ flex: 1 }}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      initialRegion={{ ...point, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      showsUserLocation
    >
      <Marker coordinate={point} />
    </MapView>
  );
}

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Text accessibilityRole="alert" className="text-sm text-danger">
      {errorText(error)}
    </Text>
  );
}

function CancelChoices({ onPick, busy }: { onPick: (reason: string) => void; busy: boolean }) {
  return (
    <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
      <Text className="text-sm font-semibold text-text">Why are you cancelling?</Text>
      {CAPTAIN_CANCEL_REASONS.map(({ code, label }) => (
        <Button key={code} variant="outline" block disabled={busy} onPress={() => onPick(code)}>
          {label}
        </Button>
      ))}
    </View>
  );
}

const STEPS = [
  { step: "to_pickup", label: "Pickup" },
  { step: "otp", label: "Code" },
  { step: "in_trip", label: "Trip" },
  { step: "collect", label: "Payment" },
] as const;

/** Where the captain is in the ride: the steps done and the current one are lit. */
function StepBar({ step }: { step: string }) {
  const at = STEPS.findIndex((s) => s.step === step);
  return (
    <View className="flex-row gap-2">
      {STEPS.map((s, index) => (
        <View key={s.step} className="flex-1 gap-1">
          <View className={`h-1 rounded-full ${index <= at ? "bg-[#f87000]" : "bg-line"}`} />
          <Text className={`text-xs ${index === at ? "font-bold text-text" : "text-text-muted"}`}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** The step's title, who it is about, and the fare on the right. */
function Header({ title, subtitle, fare }: { title: string; subtitle?: string; fare: number }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-2xl font-extrabold text-text">{title}</Text>
        {subtitle ? <Text className="text-base text-text-muted">{subtitle}</Text> : null}
      </View>
      <Text className="text-lg font-bold text-text">{formatMoney(fare)}</Text>
    </View>
  );
}

function RateRider({ ride, onDone }: { ride: CaptainRide; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const rate = useMutation({ mutationFn: () => rateRider(ride.id, stars), onSuccess: onDone });
  return (
    <View className="gap-4">
      <Text className="text-xl font-bold text-text">How was {firstName(ride.rider.name)}?</Text>
      <View className="flex-row justify-center gap-3">
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`}
            onPress={() => setStars(value)}
          >
            <Star size={36} color="#f87000" fill={value <= stars ? "#f87000" : "transparent"} />
          </Pressable>
        ))}
      </View>
      <ErrorLine error={rate.error} />
      <Button size="lg" block disabled={stars === 0} loading={rate.isPending} onPress={() => rate.mutate()}>
        Submit
      </Button>
      <Button variant="ghost" block onPress={onDone}>
        Skip
      </Button>
    </View>
  );
}

/**
 * The captain's ride, one screen that follows the server's state (brief §5.11, items 6–8): to
 * the pickup, the start code, the trip, collecting the payment, then rating the rider.
 */
export function TripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const current = useCurrentRide();
  const [otp, setOtp] = useState("");
  const [cancelling, setCancelling] = useState(false);
  // After "Payment received" the ride is no longer current, so it is kept here for the rating.
  const [paidRide, setPaidRide] = useState<CaptainRide | null>(null);

  const refresh = (ride?: CaptainRide) => {
    if (ride) queryClient.setQueryData(currentRideKey, { ride });
    void queryClient.invalidateQueries({ queryKey: currentRideKey });
  };
  const home = () => {
    void queryClient.invalidateQueries({ queryKey: captainStatusKey });
    void queryClient.invalidateQueries({ queryKey: currentRideKey });
    router.replace("/rides");
  };

  const ride = paidRide ?? current.data?.ride ?? null;
  const id = ride?.id ?? "";
  const arrived = useMutation({ mutationFn: () => markArrived(id), onSuccess: refresh });
  const start = useMutation({ mutationFn: () => startTrip(id, otp), onSuccess: refresh });
  const complete = useMutation({ mutationFn: () => completeTrip(id), onSuccess: refresh });
  const paid = useMutation({ mutationFn: () => markPaymentReceived(id), onSuccess: (done) => setPaidRide(done) });
  const cancel = useMutation({ mutationFn: (reason: string) => cancelAsCaptain(id, reason), onSuccess: home });
  const sos = useMutation({
    mutationFn: () => raiseCaptainSos(id),
    onSuccess: (answer) =>
      Alert.alert("SOS sent", "VSolve support has been alerted.", [
        { text: `Call ${answer.emergency_number}`, onPress: () => void Linking.openURL(`tel:${answer.emergency_number}`) },
        { text: "Close", style: "cancel" },
      ]),
  });

  if (current.isPending && !paidRide) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator />
      </View>
    );
  }
  if (ride === null) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <Text className="text-center text-lg font-bold text-text">{"You don't have a ride right now."}</Text>
        <Button onPress={home}>Back to Home</Button>
      </View>
    );
  }

  const step = paidRide ? "done" : tripStep(ride);
  const phone = ride.rider.phone_number;
  const name = firstName(ride.rider.name);
  const place = step === "to_pickup" ? ride.pickup : step === "in_trip" ? ride.drop : null;
  const showMap = place !== null && isInAppMapAvailable();

  // Navigate (when there is somewhere to go), Call and SOS, side by side.
  const actions = (
    <View className="flex-row gap-2">
      {place ? (
        <Button
          variant="outline"
          className="flex-1"
          onPress={() => void Linking.openURL(navigationUrl(place.latitude, place.longitude))}
        >
          Navigate
        </Button>
      ) : null}
      {phone ? (
        <Button variant="outline" className="flex-1" onPress={() => void Linking.openURL(`tel:${phone}`)}>
          Call {name}
        </Button>
      ) : null}
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
  const cancelLink = cancelling ? (
    <CancelChoices busy={cancel.isPending} onPick={(reason) => cancel.mutate(reason)} />
  ) : (
    <Button variant="ghost" block onPress={() => setCancelling(true)}>
      Cancel ride
    </Button>
  );

  // The step's details scroll; its one main action is pinned at the bottom.
  let body: React.ReactNode;
  let action: React.ReactNode = null;
  if (step === "to_pickup") {
    body = (
      <>
        <Header title="Go to the pickup" subtitle={`Pick up ${name}`} fare={ride.fare_paise} />
        <Place label="Pickup" address={ride.pickup.address} />
        {actions}
        {cancelLink}
        <ErrorLine error={cancel.error} />
      </>
    );
    action = (
      <>
        <ErrorLine error={arrived.error} />
        <Button size="lg" block loading={arrived.isPending} onPress={() => arrived.mutate()}>
          {"I've arrived"}
        </Button>
      </>
    );
  } else if (step === "otp") {
    body = (
      <>
        <Header title="Ask for the start code" subtitle={`${name} has a 4-digit code in their app.`} fare={ride.fare_paise} />
        <Input
          value={otp}
          onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="0000"
          accessibilityLabel="Start code"
          className="text-center text-3xl font-bold tracking-[0.5em]"
        />
        {actions}
        {cancelLink}
        <ErrorLine error={cancel.error} />
      </>
    );
    action = (
      <>
        <ErrorLine error={start.error} />
        <Button size="lg" block disabled={!isOtpComplete(otp)} loading={start.isPending} onPress={() => start.mutate()}>
          Start trip
        </Button>
      </>
    );
  } else if (step === "in_trip") {
    body = (
      <>
        <Header title="Drop the rider" subtitle={name} fare={ride.fare_paise} />
        <Place label="Drop" address={ride.drop.address} />
        {actions}
      </>
    );
    action = (
      <>
        <ErrorLine error={complete.error} />
        <Button
          size="lg"
          block
          loading={complete.isPending}
          onPress={() =>
            Alert.alert("End the trip?", "Only when the rider has reached the drop.", [
              { text: "Not yet", style: "cancel" },
              { text: "End trip", onPress: () => complete.mutate() },
            ])
          }
        >
          End trip
        </Button>
      </>
    );
  } else if (step === "collect") {
    const total = ride.final_fare_paise ?? ride.fare_paise;
    body = (
      <>
        <Text className="text-2xl font-extrabold text-text">Collect the payment</Text>
        <View className="items-center gap-1 rounded-2xl border border-line bg-surface p-6">
          <Text className="text-5xl font-extrabold text-text">{formatMoney(total)}</Text>
          <Text className="text-sm text-text-muted">
            {ride.waiting_paise > 0
              ? `Fare ${formatMoney(ride.fare_paise)} + waiting ${formatMoney(ride.waiting_paise)}`
              : "Cash or UPI to you"}
          </Text>
        </View>
      </>
    );
    action = (
      <>
        <ErrorLine error={paid.error} />
        <Button size="lg" block loading={paid.isPending} onPress={() => paid.mutate()}>
          Payment received
        </Button>
      </>
    );
  } else {
    body = <RateRider ride={ride} onDone={home} />;
  }

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 8 }}>
      {showMap && place ? (
        <View className="mx-4 min-h-40 flex-1 overflow-hidden rounded-2xl border border-line">
          <TripMap latitude={place.latitude} longitude={place.longitude} />
        </View>
      ) : null}
      <ScrollView
        className={showMap ? "max-h-[62%] grow-0" : "flex-1"}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: action ? 16 : insets.bottom + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {step !== "done" ? <StepBar step={step} /> : null}
        {body}
      </ScrollView>
      {action ? (
        <View className="gap-2 border-t border-line bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          {action}
        </View>
      ) : null}
    </View>
  );
}
