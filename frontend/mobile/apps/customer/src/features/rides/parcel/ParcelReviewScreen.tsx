import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isApiRequestError } from "@vsolve/api-client";
import { Button, Sheet, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Package, Square } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bookParcel, findOpenRide, useAvailability, useFareQuotes } from "../queries";
import { tripFrom } from "../trip-params";
import { VEHICLES } from "../vehicles";
import { useParcelDraft } from "./draft";
import {
  canConfirm,
  guidelineLimits,
  isEndComplete,
  limitsText,
  meetLabel,
  payerLine,
  placeLine,
  toRequest,
  type ParcelEnd,
  type Side,
} from "./model";
import { Toggle } from "./toggle";

const SIGNAL = "#f87000";

/** What agreeing means, said once above the button (D6): there is no tick box. */
const AGREEMENT =
  "By confirming, you agree your package follows these guidelines and is not on the prohibited list. Items are not insured.";

function errorText(error: unknown): string {
  const code = isApiRequestError(error) ? error.code : null;
  if (code === "quote_expired" || code === "quote_used") return "The price changed. Check the new price and confirm again.";
  if (code === "ride_already_open") return "You already have a ride or a parcel going.";
  if (code === "vehicle_unavailable") return "This vehicle can't be booked here right now. Go back and choose another.";
  return describeError(error, "mutation").message;
}

/** One end of the trip: who is there, the address, how to meet them, and Add or Edit (§5.2, item 4). */
function EndRow({
  side,
  end,
  address,
  onPress,
}: {
  side: Side;
  end: ParcelEnd;
  address: string;
  onPress: () => void;
}) {
  const complete = isEndComplete(end);
  const placeholder = side === "pickup" ? "Add sender details" : "Add recipient details";
  const building = placeLine(end);
  return (
    <View className="flex-row items-start gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-sunken">
        {side === "pickup" ? <Package size={18} color="#00246b" /> : <Square size={16} color="#00246b" fill="#00246b" />}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className={end.name.trim() ? "text-base font-bold text-text" : "text-base font-bold text-text-muted"}>
          {end.name.trim() || placeholder}
        </Text>
        <Text className="text-sm text-text" numberOfLines={2}>
          {address}
        </Text>
        {building ? <Text className="text-sm text-text-muted">{building}</Text> : null}
        <Text className="text-sm text-text-muted">
          {meetLabel(end.meet_at)}
          {end.instructions.trim() ? ` · ${end.instructions.trim()}` : ""}
        </Text>
      </View>
      <Button size="sm" variant="outline" onPress={onPress}>
        {complete ? "Edit" : "Add"}
      </Button>
    </View>
  );
}

/**
 * Review: sending or receiving, both ends, who pays, PIN confirmation and the package guidelines,
 * then Confirm with the server's fare on the button (§5.2, item 4). The prices, the limits and the
 * prohibited list all come from the server.
 */
export function ParcelReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<Record<string, string>>();
  const { pickupLat, pickupLng, pickupLabel, dropLat, dropLng, dropLabel, vehicle } = params;
  const trip = useMemo(
    () => tripFrom({ pickupLat, pickupLng, pickupLabel, dropLat, dropLng, dropLabel }),
    [pickupLat, pickupLng, pickupLabel, dropLat, dropLng, dropLabel],
  );
  const { draft, setMode, setPayer, setPinRequired } = useParcelDraft();
  const [prohibitedOpen, setProhibitedOpen] = useState(false);

  // The prices chosen on the last screen are still kept (the same trip, the same key).
  const quotes = useFareQuotes(trip, true, "PARCEL");
  const list = quotes.data?.quotes ?? [];
  const quote = list.find((item) => item.vehicle_type === vehicle) ?? null;
  const rules = useAvailability(
    trip ? { latitude: Number(trip.pickup.latitude), longitude: Number(trip.pickup.longitude) } : null,
  );

  const book = useMutation({
    mutationFn: () => bookParcel(quote!.id, toRequest(draft)),
    onSuccess: (ride) => {
      // The quotes are used up: forget them, so a later parcel gets fresh prices.
      queryClient.removeQueries({ queryKey: ["rides", "quotes"] });
      router.replace(`/rides/ride/${ride.id}` as never);
    },
    onError: async (error) => {
      const code = isApiRequestError(error) ? error.code : null;
      if (code === "quote_expired" || code === "quote_used") void quotes.refetch();
      if (code === "ride_already_open") {
        const openId = await findOpenRide().catch(() => null);
        if (openId) router.replace(`/rides/ride/${openId}` as never);
      }
    },
  });

  const edit = (side: Side) =>
    router.push({
      pathname: "/rides/parcel/contact",
      params: { side, address: side === "pickup" ? trip?.pickup.address : trip?.drop.address },
    } as never);

  if (trip === null) {
    return (
      <Notice text="Trip details are missing. Go back and choose where it should go.">
        <Button onPress={() => router.back()}>Back</Button>
      </Notice>
    );
  }
  if (quotes.isPending) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-canvas">
        <ActivityIndicator color="#2563EB" />
        <Text className="text-sm text-slate-500">Getting prices…</Text>
      </View>
    );
  }
  if (quotes.isError) {
    return (
      <Notice text={describeError(quotes.error, "read").message}>
        <Button onPress={() => void quotes.refetch()}>Try again</Button>
      </Notice>
    );
  }
  if (quote === null) {
    return (
      <Notice text="This vehicle isn't available for this trip. Go back and choose another.">
        <Button onPress={() => router.back()}>Back</Button>
      </Notice>
    );
  }

  const fare = formatMoney(quote.fare_paise);
  const vehicleName = VEHICLES[quote.vehicle_type].name;
  const parcelRules = rules.data?.parcel_rules;

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Toggle
          label="Sending or receiving"
          value={draft.mode}
          options={[
            { value: "SEND", label: "I'm sending" },
            { value: "RECEIVE", label: "I'm receiving" },
          ]}
          onChange={setMode}
        />

        <View className="gap-4 rounded-card border border-line bg-surface p-4">
          <Text className="text-base font-extrabold text-text">Trip details</Text>
          <EndRow side="pickup" end={draft.pickup} address={trip.pickup.address} onPress={() => edit("pickup")} />
          <EndRow side="drop" end={draft.drop} address={trip.drop.address} onPress={() => edit("drop")} />
          <View className="flex-row items-center justify-between gap-3 border-t border-line pt-3">
            <View className="flex-1">
              <Text className="text-sm font-bold text-text">{vehicleName}</Text>
              <Text className="text-xs text-text-muted">{limitsText(quote)}</Text>
            </View>
            <Button size="sm" variant="ghost" onPress={() => router.back()}>
              Change
            </Button>
          </View>
        </View>

        <View className="gap-3 rounded-card border border-line bg-surface p-4">
          <Text className="text-base font-extrabold text-text">Who pays?</Text>
          <Toggle
            label="Who pays"
            value={draft.payer}
            options={[
              { value: "SENDER", label: "Sender" },
              { value: "RECEIVER", label: "Receiver" },
            ]}
            onChange={setPayer}
          />
          <Text className="text-sm text-text-muted">{payerLine(draft.payer, fare)}</Text>
        </View>

        <View className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4">
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-extrabold text-text">PIN confirmation</Text>
            <Text className="text-sm text-text-muted">
              Add peace of mind? Turn on to confirm delivery with a 4-digit PIN.
            </Text>
          </View>
          <Switch
            accessibilityLabel="PIN confirmation"
            value={draft.pinRequired}
            onValueChange={setPinRequired}
            trackColor={{ true: SIGNAL }}
          />
        </View>

        <View className="gap-1.5 rounded-card border border-line bg-surface p-4">
          <Text className="text-base font-extrabold text-text">Package guidelines</Text>
          {guidelineLimits(list, (type) => VEHICLES[type as keyof typeof VEHICLES]?.name ?? type).map((line) => (
            <Text key={line} className="text-sm text-text">
              {line}
            </Text>
          ))}
          <Text className="text-sm text-text">
            {parcelRules ? `${formatMoney(parcelRules.value_cap_paise)} or less in value` : "Value limit loading…"}
          </Text>
          <Text className="text-sm text-text">Securely sealed and ready for pickup</Text>
          <Pressable accessibilityRole="link" onPress={() => setProhibitedOpen(true)} className="min-h-touch justify-center">
            <Text className="text-sm font-semibold text-text-link">See prohibited items</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={{ paddingBottom: Math.max(insets.bottom, 12) }} className="gap-2 border-t border-line bg-surface px-4 pt-3">
        <Text className="text-xs text-text-muted">{AGREEMENT}</Text>
        {book.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger-text">
            {errorText(book.error)}
          </Text>
        ) : null}
        <Button size="lg" block disabled={!canConfirm(draft)} loading={book.isPending} onPress={() => book.mutate()}>
          {`Confirm Pick up & Drop · ${fare}`}
        </Button>
      </View>

      <Sheet open={prohibitedOpen} onOpenChange={setProhibitedOpen} title="Prohibited items" description="We can't carry these.">
        {rules.isError ? (
          <View className="items-center gap-3 py-4">
            <Text className="text-center text-sm text-text-muted">{describeError(rules.error, "read").message}</Text>
            <Button onPress={() => void rules.refetch()}>Try again</Button>
          </View>
        ) : parcelRules ? (
          <View className="gap-2 py-2">
            {parcelRules.prohibited_items.map((item) => (
              <Text key={item} className="text-base text-text">
                {`• ${item}`}
              </Text>
            ))}
          </View>
        ) : (
          <ActivityIndicator color="#2563EB" />
        )}
      </Sheet>
    </View>
  );
}

function Notice({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
      <Text className="text-center text-base text-text">{text}</Text>
      {children}
    </View>
  );
}
