import { isApiRequestError } from "@vsolve/api-client";
import { Button, Input, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError, useServerCountdown } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { KeyRound, MapPin, Navigation, Package, Phone, RotateCcw, ShieldAlert, Wallet } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isInAppMapAvailable } from "@/features/work/route";

import {
  amountToCollect,
  buildingLine,
  callUrl,
  canMarkNotPaid,
  collectReason,
  isPinComplete,
  meetText,
  needsDeliveryPin,
  parcelProgress,
  parcelStep,
  type ParcelStep,
} from "../model/parcel-trip";
import { firstName, isOtpComplete, navigationUrl } from "../model/trip";
import {
  cancelAsCaptain,
  captainStatusKey,
  currentRideKey,
  deliverParcel,
  markArrived,
  markArrivedAtDrop,
  markPaymentNotReceived,
  markPaymentReceived,
  markReceiverUnavailable,
  raiseCaptainSos,
  returnParcel,
  startTrip,
  useCurrentRide,
  type CaptainRide,
} from "../queries";
import { CancelChoices, Header, TripMap } from "./trip-screen";

/** The reason the server gets when the captain refuses the item at the pickup (D16). */
const ITEM_NOT_ALLOWED = "ITEM_NOT_ALLOWED";

type Parcel = NonNullable<CaptainRide["parcel"]>;
type End = NonNullable<Parcel["pickup"]>;

/** A wrong code or PIN says how many tries are left, as the Rides start code does. */
function errorText(error: unknown): string {
  if (isApiRequestError(error) && (error.code === "otp_invalid" || error.code === "pin_invalid")) {
    const left = (error.details as { attempts_left?: number } | null)?.attempts_left;
    const what = error.code === "pin_invalid" ? "PIN" : "code";
    return typeof left === "number" ? `That ${what} is wrong. ${left} ${left === 1 ? "try" : "tries"} left.` : error.message;
  }
  return describeError(error, "mutation").message;
}

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Text accessibilityRole="alert" className="text-sm text-danger">
      {errorText(error)}
    </Text>
  );
}

/** One bar that fills as the job moves on, with the step names under it. */
function Progress({ labels, at }: { labels: readonly string[]; at: number }) {
  return (
    <View className="gap-2 px-4">
      <View className="h-1.5 overflow-hidden rounded-full bg-line">
        <View className="h-full rounded-full bg-[#f87000]" style={{ width: `${((at + 1) / labels.length) * 100}%` }} />
      </View>
      <View className="flex-row">
        {labels.map((label, index) => (
          <Text
            key={label}
            className={`flex-1 text-center text-xs ${index === at ? "font-bold text-text" : index < at ? "text-text" : "text-text-muted"}`}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const STEP_ICON = {
  to_pickup: MapPin,
  pickup_code: KeyRound,
  collect_sender: Wallet,
  to_drop: Navigation,
  collect_receiver: Wallet,
  hand_over: Package,
  returning: RotateCcw,
  done: Package,
} as const;

/** A large soft icon for the step, in the middle of the page when there is no map to show. */
function StepVisual({ step }: { step: ParcelStep }) {
  const Icon = STEP_ICON[step];
  return (
    <View testID="step-visual" className="h-24 w-24 items-center justify-center rounded-full bg-[#fff4ea]">
      <Icon size={40} color="#f87000" />
    </View>
  );
}

/**
 * One end of the job: where it is, who is there, how to meet them and a way to call. Both ends
 * show only while the parcel is open: the server sends nothing once it is not (D20).
 */
function EndCard({ title, address, end, current }: { title: string; address: string; end: End | null; current: boolean }) {
  const building = end ? buildingLine(end) : "";
  return (
    <View className={`gap-1.5 rounded-2xl border border-line bg-canvas p-4 ${current ? "" : "opacity-60"}`}>
      <Text className="text-xs font-semibold uppercase text-text-muted">{title}</Text>
      <Text className={`text-base ${current ? "font-semibold" : ""} text-text`}>{address}</Text>
      {end ? (
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-semibold text-text">{end.name}</Text>
            {building ? <Text className="text-sm text-text-muted">{building}</Text> : null}
            <Text className="text-sm text-text-muted">{meetText(end.meet_at)}</Text>
            {end.instructions ? <Text className="text-sm italic text-text-muted">{end.instructions}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${firstName(end.name)}`}
            onPress={() => void Linking.openURL(callUrl(end.phone))}
            className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface active:opacity-60"
          >
            <Phone size={20} color="#071328" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  danger = false,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
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
}

/**
 * The captain's Pick up & Drop job: one screen that follows the server's state (brief §6.3). To
 * the pickup, the pickup code (or "Can't take this item"), the sender's money, the drop, the
 * receiver's money first, then the PIN or Delivered; or, with the receiver not there, back to the
 * pickup with the code and the money.
 */
export function ParcelTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const current = useCurrentRide();
  const [code, setCode] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [collectLater, setCollectLater] = useState(false);
  // Once the last step is done the ride is no longer current, so it is kept here for the summary.
  const [finished, setFinished] = useState<CaptainRide | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const ride = finished ?? current.data?.ride ?? null;
  const parcel = ride?.parcel ?? null;
  // "Receiver not available" opens on the server's own time, so a wrong phone clock cannot open it.
  const wait = useServerCountdown(parcel?.receiver_unavailable_allowed_at ?? null, 1000);
  const step: ParcelStep = ride ? parcelStep(ride, collectLater) : "done";
  // A typed code belongs to one step: it is cleared when the step changes (adjusted while
  // rendering, as React advises, instead of in an effect).
  const [codeStep, setCodeStep] = useState(step);
  if (codeStep !== step) {
    setCodeStep(step);
    setCode("");
  }

  const refresh = (next: CaptainRide) => {
    queryClient.setQueryData(currentRideKey, { ride: next });
    void queryClient.invalidateQueries({ queryKey: currentRideKey });
    if (parcelStep(next) === "done") setFinished(next);
  };
  const home = () => {
    void queryClient.invalidateQueries({ queryKey: captainStatusKey });
    void queryClient.invalidateQueries({ queryKey: currentRideKey });
    router.replace("/rides");
  };

  const id = ride?.id ?? "";
  const arrived = useMutation({ mutationFn: () => markArrived(id), onSuccess: refresh });
  const picked = useMutation({ mutationFn: () => startTrip(id, code), onSuccess: refresh });
  const atDrop = useMutation({ mutationFn: () => markArrivedAtDrop(id), onSuccess: refresh });
  const paid = useMutation({ mutationFn: () => markPaymentReceived(id), onSuccess: refresh });
  const notPaid = useMutation({ mutationFn: () => markPaymentNotReceived(id), onSuccess: refresh });
  const delivered = useMutation({ mutationFn: () => deliverParcel(id, code || undefined), onSuccess: refresh });
  const unavailable = useMutation({ mutationFn: () => markReceiverUnavailable(id), onSuccess: refresh });
  const returned = useMutation({ mutationFn: () => returnParcel(id, code), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (reason: string) => cancelAsCaptain(id, reason), onSuccess: home });
  const sos = useMutation({
    mutationFn: () => raiseCaptainSos(id),
    onSuccess: (answer) =>
      Alert.alert("SOS sent", "VSolve support has been alerted.", [
        { text: `Call ${answer.emergency_number}`, onPress: () => void Linking.openURL(`tel:${answer.emergency_number}`) },
        { text: "Close", style: "cancel" },
      ]),
  });

  if (current.isPending && !finished) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator />
      </View>
    );
  }
  if (ride === null || parcel === null) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <Text className="text-center text-lg font-bold text-text">{"You don't have a parcel right now."}</Text>
        <Button onPress={home}>Back to Home</Button>
      </View>
    );
  }

  const sender = firstName(parcel.pickup?.name ?? "Sender");
  const receiver = firstName(parcel.drop?.name ?? "Receiver");
  const amount = amountToCollect(ride);
  const place =
    step === "to_pickup" || step === "returning"
      ? ride.pickup
      : step === "to_drop" || step === "hand_over"
        ? ride.drop
        : null;
  const showMap = place !== null && isInAppMapAvailable();
  const { labels, at } = parcelProgress(ride, step);
  const underWay = step !== "done" && step !== "collect_sender";
  const canCancel = step === "to_pickup" || step === "pickup_code";

  const actions = (
    <View className="flex-row rounded-2xl border border-line bg-canvas py-3">
      {place ? (
        <ActionButton
          label="Navigate"
          icon={<Navigation size={20} color="#071328" />}
          onPress={() => void Linking.openURL(navigationUrl(place.latitude, place.longitude))}
        />
      ) : null}
      <ActionButton
        label="SOS"
        danger
        icon={<ShieldAlert size={20} color="#b3261e" />}
        onPress={() =>
          Alert.alert("Send SOS?", "VSolve support will be alerted at once.", [
            { text: "Cancel", style: "cancel" },
            { text: "Send SOS", style: "destructive", onPress: () => sos.mutate() },
          ])
        }
      />
    </View>
  );

  let header: React.ReactNode;
  let panel: React.ReactNode = null;
  let action: React.ReactNode = null;
  const amountPanel = (
    <View className="items-center gap-1 rounded-2xl border border-line bg-canvas p-6">
      <Text className="text-5xl font-extrabold text-text">{formatMoney(amount)}</Text>
      <Text className="text-sm text-text-muted">{collectReason(ride)}</Text>
    </View>
  );
  const codeInput = (label: string) => (
    <Input
      value={code}
      onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 4))}
      keyboardType="number-pad"
      maxLength={4}
      placeholder="0000"
      accessibilityLabel={label}
      className="text-center text-3xl font-bold tracking-[0.5em]"
    />
  );

  if (step === "to_pickup") {
    header = <Header title="Go to the pickup" subtitle={`Pick up from ${sender}`} fare={ride.fare_paise} />;
    action = (
      <>
        <ErrorLine error={arrived.error} />
        <Button size="lg" block loading={arrived.isPending} onPress={() => arrived.mutate()}>
          {"I've arrived"}
        </Button>
      </>
    );
  } else if (step === "pickup_code") {
    header = <Header title="Ask for the pickup code" subtitle={`${sender} has a 4-digit code in their app.`} fare={ride.fare_paise} />;
    panel = codeInput("Pickup code");
    action = (
      <>
        <ErrorLine error={picked.error} />
        <Button size="lg" block disabled={!isOtpComplete(code)} loading={picked.isPending} onPress={() => picked.mutate()}>
          Pick up the parcel
        </Button>
        <Button
          variant="outline"
          block
          loading={cancel.isPending}
          onPress={() =>
            Alert.alert(
              "Can't take this item?",
              "Use this when it is too heavy or too big for your vehicle, is not sealed, or is on the prohibited list. Nobody is charged, and it is not offered to another captain.",
              [
                { text: "Not now", style: "cancel" },
                { text: "Can't take it", style: "destructive", onPress: () => cancel.mutate(ITEM_NOT_ALLOWED) },
              ],
            )
          }
        >
          {"Can't take this item"}
        </Button>
      </>
    );
  } else if (step === "collect_sender") {
    const late = ride.state === "COMPLETED";
    const back = ride.state === "RETURNED";
    header = (
      <Header
        title={back ? "Collect at the pickup" : "Collect the payment"}
        subtitle={`From ${sender}`}
      />
    );
    panel = amountPanel;
    action = (
      <>
        <ErrorLine error={paid.error ?? notPaid.error} />
        <Button size="lg" block loading={paid.isPending} onPress={() => paid.mutate()}>
          Payment received
        </Button>
        {canMarkNotPaid(ride) ? (
          <Button
            variant="outline"
            block
            loading={notPaid.isPending}
            onPress={() =>
              Alert.alert("Not paid?", "Operations will follow this up with the sender.", [
                { text: "Not yet", style: "cancel" },
                { text: "Not paid", style: "destructive", onPress: () => notPaid.mutate() },
              ])
            }
          >
            Not paid
          </Button>
        ) : null}
        {!late && !back ? (
          <Button variant="ghost" block onPress={() => setCollectLater(true)}>
            Collect later
          </Button>
        ) : null}
      </>
    );
  } else if (step === "to_drop") {
    header = <Header title="Take it to the drop" subtitle={`Deliver to ${receiver}`} fare={ride.fare_paise} />;
    action = (
      <>
        <ErrorLine error={atDrop.error} />
        <Button size="lg" block loading={atDrop.isPending} onPress={() => atDrop.mutate()}>
          {"I've arrived at the drop"}
        </Button>
      </>
    );
  } else if (step === "collect_receiver") {
    header = <Header title="Collect before you hand over" subtitle={`From ${receiver}`} />;
    panel = amountPanel;
    action = (
      <>
        <ErrorLine error={paid.error} />
        <Button size="lg" block loading={paid.isPending} onPress={() => paid.mutate()}>
          Payment received
        </Button>
      </>
    );
  } else if (step === "hand_over") {
    const withPin = needsDeliveryPin(ride);
    // The button opens on the server's time, or at once when the PIN is locked.
    const canLeave = wait !== null && wait.isExpired;
    header = withPin ? (
      <Header title="Ask for the delivery PIN" subtitle={`${receiver} has a 4-digit PIN in the app.`} fare={ride.fare_paise} />
    ) : (
      <Header title="Hand over the parcel" subtitle={`Give it to ${receiver}`} fare={ride.fare_paise} />
    );
    panel = withPin ? codeInput("Delivery PIN") : null;
    action = (
      <>
        <ErrorLine error={delivered.error ?? unavailable.error} />
        {withPin ? (
          <Button size="lg" block disabled={!isPinComplete(code)} loading={delivered.isPending} onPress={() => delivered.mutate()}>
            Deliver
          </Button>
        ) : (
          <Button
            size="lg"
            block
            loading={delivered.isPending}
            onPress={() =>
              Alert.alert("Delivered?", `Only when ${receiver} has the parcel.`, [
                { text: "Not yet", style: "cancel" },
                { text: "Delivered", onPress: () => delivered.mutate() },
              ])
            }
          >
            Delivered
          </Button>
        )}
        <Button
          variant="outline"
          block
          disabled={!canLeave}
          loading={unavailable.isPending}
          onPress={() =>
            Alert.alert(
              "Receiver not available?",
              "You will take the parcel back to the pickup. The sender pays for the return trip.",
              [
                { text: "Not yet", style: "cancel" },
                { text: "Take it back", onPress: () => unavailable.mutate() },
              ],
            )
          }
        >
          {wait && !wait.isExpired ? `Receiver not available (in ${wait.display})` : "Receiver not available"}
        </Button>
      </>
    );
  } else if (step === "returning") {
    header = <Header title="Take it back to the pickup" subtitle={`Return it to ${sender}`} fare={parcel.return_fare_paise ?? undefined} />;
    panel = codeInput("Pickup code");
    action = (
      <>
        <ErrorLine error={returned.error} />
        <Button size="lg" block disabled={!isOtpComplete(code)} loading={returned.isPending} onPress={() => returned.mutate()}>
          Parcel returned
        </Button>
        <Text className="text-center text-sm text-text-muted">{`Ask ${sender} for the pickup code.`}</Text>
      </>
    );
  } else {
    const wasReturned = ride.state === "RETURNED";
    header = (
      <Header
        title={wasReturned ? "Parcel returned" : ride.state === "COMPLETED" ? "Parcel delivered" : "Job finished"}
        subtitle={wasReturned && !paidNote(ride) ? undefined : paidNote(ride)}
      />
    );
    action = (
      <Button size="lg" block onPress={home}>
        Back to Home
      </Button>
    );
  }

  return (
    // "padding" lifts the whole page above the keyboard, as on the Rides trip screen.
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 8 }}>
      <Progress labels={labels} at={at} />

      {showMap && place ? (
        <View className="flex-1 gap-3 px-4 pt-4">
          {header}
          <View className="min-h-40 flex-1 overflow-hidden rounded-2xl border border-line">
            <TripMap latitude={place.latitude} longitude={place.longitude} />
          </View>
        </View>
      ) : (
        <View
          className="flex-1 items-center justify-center gap-5 px-6 pt-3"
          style={keyboardOpen ? { minHeight: 180 } : undefined}
        >
          {keyboardOpen ? null : <StepVisual step={step} />}
          {header}
        </View>
      )}

      <View
        className="rounded-t-3xl border-t border-line bg-surface px-4 pt-4"
        style={{
          maxHeight: windowHeight * 0.7,
          paddingBottom: keyboardOpen ? 12 : Math.max(insets.bottom, 16) + 36,
          elevation: 12,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        }}
      >
        <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {panel}
          {keyboardOpen || step === "done" ? null : (
            <View className="gap-3">
              <EndCard
                title="Pickup"
                address={ride.pickup.address}
                end={parcel.pickup}
                current={step === "to_pickup" || step === "pickup_code" || step === "returning"}
              />
              <EndCard
                title="Drop"
                address={ride.drop.address}
                end={parcel.drop}
                current={step === "to_drop" || step === "hand_over" || step === "collect_receiver"}
              />
            </View>
          )}
          {underWay && !keyboardOpen ? actions : null}
          {action}
          {canCancel && !keyboardOpen ? (
            cancelling ? (
              <CancelChoices busy={cancel.isPending} onPick={(reason) => cancel.mutate(reason)} />
            ) : (
              <Button variant="ghost" block onPress={() => setCancelling(true)}>
                Cancel
              </Button>
            )
          ) : null}
          {canCancel && !keyboardOpen ? <ErrorLine error={cancel.error} /> : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/** What was left unpaid on a finished parcel, in words, so Not paid is not a silent end. */
function paidNote(ride: CaptainRide): string | undefined {
  if (ride.payment_status === "UNPAID" || ride.parcel?.return_payment_status === "UNPAID") {
    return "Not paid. Operations will follow it up.";
  }
  return undefined;
}
