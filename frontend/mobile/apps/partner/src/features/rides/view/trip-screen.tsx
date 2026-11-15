import { isApiRequestError } from "@vsolve/api-client";
import { Button, Input, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { KeyRound, MapPin, Navigation, Phone, ShieldAlert, Star, Wallet } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
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
    <View className="gap-2 rounded-2xl border border-line bg-canvas p-4">
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
  { step: "done", label: "Rate" },
] as const;

/**
 * Where the captain is in the ride: one bar that fills, smoothly, as each step is reached, with
 * the step names under it.
 */
function Progress({ step }: { step: string }) {
  const at = Math.max(0, STEPS.findIndex((s) => s.step === step));
  const [filled] = useState(() => new Animated.Value(at + 1));
  useEffect(() => {
    Animated.timing(filled, { toValue: at + 1, duration: 350, useNativeDriver: false }).start();
  }, [at, filled]);
  const width = filled.interpolate({ inputRange: [0, STEPS.length], outputRange: ["0%", "100%"] });
  return (
    <View className="gap-2 px-4">
      <View className="h-1.5 overflow-hidden rounded-full bg-line">
        <Animated.View className="h-full rounded-full bg-[#f87000]" style={{ width }} />
      </View>
      <View className="flex-row">
        {STEPS.map((item, index) => (
          <Text
            key={item.step}
            className={`flex-1 text-center text-xs ${index === at ? "font-bold text-text" : index < at ? "text-text" : "text-text-muted"}`}
          >
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const STEP_ICON = { to_pickup: MapPin, otp: KeyRound, in_trip: Navigation, collect: Wallet, done: Star } as const;

/** A large soft icon for the step, in the middle of the page when there is no map to show. */
function StepVisual({ step }: { step: string }) {
  const Icon = STEP_ICON[step as keyof typeof STEP_ICON] ?? MapPin;
  return (
    <View testID="step-visual" className="h-24 w-24 items-center justify-center rounded-full bg-[#fff4ea]">
      <Icon size={40} color="#f87000" />
    </View>
  );
}

/** The step's title and who it is about, centred, with the fare under them. */
function Header({ title, subtitle, fare }: { title: string; subtitle?: string; fare?: number }) {
  return (
    <View className="items-center gap-1">
      <Text className="text-center text-3xl font-extrabold text-text">{title}</Text>
      {subtitle ? <Text className="text-center text-base text-text-muted">{subtitle}</Text> : null}
      {fare !== undefined ? (
        <View className="mt-1 rounded-full bg-surface px-3 py-1">
          <Text className="text-sm font-bold text-text">{formatMoney(fare)}</Text>
        </View>
      ) : null}
    </View>
  );
}

type Leg = "current" | "next" | "done";

/** One end of the trip: the place you are heading to is bold, the one behind you dimmed. */
function RouteRow({ kind, address, leg }: { kind: "pickup" | "drop"; address: string; leg: Leg }) {
  return (
    <View className={`flex-row items-start gap-3 ${leg === "done" ? "opacity-50" : ""}`}>
      <View className={`mt-1.5 h-2.5 w-2.5 ${kind === "pickup" ? "rounded-full bg-green-600" : "bg-text"}`} />
      <Text className={`flex-1 ${leg === "current" ? "text-base font-semibold text-text" : "text-sm text-text-muted"}`}>
        {address}
      </Text>
    </View>
  );
}

/** Pickup and drop on every step, so the page does not change shape as the ride moves on. */
function RouteCard({ ride, step }: { ride: CaptainRide; step: string }) {
  const toPickup = step === "to_pickup" || step === "otp";
  return (
    <View className="gap-3 rounded-2xl border border-line bg-canvas p-4">
      <RouteRow kind="pickup" address={ride.pickup.address} leg={toPickup ? "current" : "done"} />
      <RouteRow
        kind="drop"
        address={ride.drop.address}
        leg={step === "in_trip" ? "current" : toPickup ? "next" : "done"}
      />
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
  const { height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const current = useCurrentRide();
  const [otp, setOtp] = useState("");
  const [cancelling, setCancelling] = useState(false);
  // After "Payment received" the ride is no longer current, so it is kept here for the rating.
  const [paidRide, setPaidRide] = useState<CaptainRide | null>(null);
  // With the keyboard open (the start code), the big icon steps aside so the sheet has the room.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
  const [stars, setStars] = useState(0);
  const rate = useMutation({ mutationFn: () => rateRider(id, stars), onSuccess: home });
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

  // Navigate (when there is somewhere to go), Call and SOS: round icon buttons with a label, the
  // way a ride app shows them.
  const actionButton = (label: string, icon: React.ReactNode, onPress: () => void, danger = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-1 items-center gap-1.5 active:opacity-60"
    >
      <View
        className={`h-12 w-12 items-center justify-center rounded-full ${danger ? "bg-red-50" : "border border-line bg-canvas"}`}
      >
        {icon}
      </View>
      <Text className={`text-xs font-semibold ${danger ? "text-danger" : "text-text"}`}>{label}</Text>
    </Pressable>
  );
  const actions = (
    <View className="flex-row rounded-2xl border border-line bg-canvas py-3">
      {place
        ? actionButton("Navigate", <Navigation size={20} color="#071328" />, () =>
            void Linking.openURL(navigationUrl(place.latitude, place.longitude)),
          )
        : null}
      {phone
        ? actionButton(`Call ${name}`, <Phone size={20} color="#071328" />, () => void Linking.openURL(`tel:${phone}`))
        : null}
      {actionButton(
        "SOS",
        <ShieldAlert size={20} color="#b3261e" />,
        () =>
          Alert.alert("Send SOS?", "VSolve support will be alerted at once.", [
            { text: "Cancel", style: "cancel" },
            { text: "Send SOS", style: "destructive", onPress: () => sos.mutate() },
          ]),
        true,
      )}
    </View>
  );
  const cancelLink = cancelling ? (
    <CancelChoices busy={cancel.isPending} onPick={(reason) => cancel.mutate(reason)} />
  ) : (
    <Button variant="ghost" block onPress={() => setCancelling(true)}>
      Cancel ride
    </Button>
  );

  // One page from pickup to review. What changes per step is the title, a small panel (the start
  // code, the amount to collect, the stars) and the one main action, which is pinned at the bottom.
  let header: React.ReactNode;
  let panel: React.ReactNode = null;
  let action: React.ReactNode = null;
  if (step === "to_pickup") {
    header = <Header title="Go to the pickup" subtitle={`Pick up ${name}`} fare={ride.fare_paise} />;
    action = (
      <>
        <ErrorLine error={arrived.error} />
        <Button size="lg" block loading={arrived.isPending} onPress={() => arrived.mutate()}>
          {"I've arrived"}
        </Button>
      </>
    );
  } else if (step === "otp") {
    header = <Header title="Ask for the start code" subtitle={`${name} has a 4-digit code in their app.`} fare={ride.fare_paise} />;
    panel = (
      <Input
        value={otp}
        onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="0000"
        accessibilityLabel="Start code"
        className="text-center text-3xl font-bold tracking-[0.5em]"
      />
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
    header = <Header title="Drop the rider" subtitle={name} fare={ride.fare_paise} />;
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
    header = <Header title="Collect the payment" subtitle={`From ${name}`} />;
    panel = (
      <View className="items-center gap-1 rounded-2xl border border-line bg-canvas p-6">
        <Text className="text-5xl font-extrabold text-text">{formatMoney(total)}</Text>
        <Text className="text-sm text-text-muted">
          {ride.waiting_paise > 0
            ? `Fare ${formatMoney(ride.fare_paise)} + waiting ${formatMoney(ride.waiting_paise)}`
            : "Cash or UPI to you"}
        </Text>
      </View>
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
    header = <Header title={`How was ${name}?`} subtitle="Trip complete" />;
    panel = (
      <View className="flex-row justify-center gap-3 rounded-2xl border border-line bg-canvas py-5">
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
    );
    action = (
      <>
        <ErrorLine error={rate.error} />
        <Button size="lg" block disabled={stars === 0} loading={rate.isPending} onPress={() => rate.mutate()}>
          Submit
        </Button>
        <Button variant="ghost" block onPress={home}>
          Skip
        </Button>
      </>
    );
  }
  // Navigate, Call and SOS while the ride is under way; Cancel only until the trip starts.
  const underWay = step === "to_pickup" || step === "otp" || step === "in_trip";
  const canCancel = step === "to_pickup" || step === "otp";

  return (
    // "padding" lifts the whole page above the keyboard; on this phone the screen does not shrink
    // for it, and the sheet and its Start trip button were left underneath.
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 8 }}>
      <Progress step={step} />

      {showMap && place ? (
        <View className="flex-1 gap-3 px-4 pt-4">
          {header}
          <View className="min-h-40 flex-1 overflow-hidden rounded-2xl border border-line">
            <TripMap latitude={place.latitude} longitude={place.longitude} />
          </View>
        </View>
      ) : (
        // The header always keeps its own height (minHeight): squeezed, it ran over the progress
        // labels above it and under the sheet below it.
        <View
          className="flex-1 items-center justify-center gap-5 px-6 pt-3"
          style={keyboardOpen ? { minHeight: 180 } : undefined}
        >
          {keyboardOpen ? null : <StepVisual step={step} />}
          {header}
        </View>
      )}

      {/* One sheet for the whole ride: its contents change per step, the page does not. */}
      <View
        className="rounded-t-3xl border-t border-line bg-surface px-4 pt-4"
        style={{
          maxHeight: windowHeight * 0.68,
          // Clear of the screen edge: a little more than the gesture bar, so the button is not at the very bottom.
          paddingBottom: keyboardOpen ? 12 : Math.max(insets.bottom, 16) + 36,
          elevation: 12,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        }}
      >
        <ScrollView
          contentContainerStyle={{ gap: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {panel}
          {/* While the keyboard is open the sheet is just the input and the button: the rest is
              there again as soon as it closes. */}
          {keyboardOpen ? null : <RouteCard ride={ride} step={step} />}
          {underWay && !keyboardOpen ? actions : null}
          {action}
          {canCancel && !keyboardOpen ? cancelLink : null}
          {canCancel && !keyboardOpen ? <ErrorLine error={cancel.error} /> : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
