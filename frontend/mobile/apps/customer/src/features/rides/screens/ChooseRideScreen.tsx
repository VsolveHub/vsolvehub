import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isApiRequestError } from "@vsolve/api-client";
import { useAuthStore } from "@vsolve/mobile-core";
import { Button, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";

import { decodePolyline } from "../polyline";
import { bookRide, findOpenRide, useFareQuotes, type Trip } from "../queries";
import { VEHICLES, type VehicleType } from "../vehicles";

const ROUTE_BLUE = "#2563EB";

/**
 * Ask for prices again this long after they arrived. The server keeps a quote 5 minutes, so this
 * leaves a margin. Counted on the phone's own clock from the moment the answer came in, never
 * from the quote's `expires_at`: that is the server's clock, and a phone a few minutes off would
 * see every quote as already expired and ask again in a loop.
 */
const QUOTES_REFRESH_MS = 4.5 * 60 * 1000;

type Params = Record<
  "pickupLat" | "pickupLng" | "pickupLabel" | "dropLat" | "dropLng" | "dropLabel",
  string
>;

/** The trip from the Where-to screen, or null if any part is missing or not a number. */
function tripFrom(params: Partial<Params>): Trip | null {
  const point = (lat?: string, lng?: string, address?: string) => {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !address) return null;
    return { latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), address };
  };
  const pickup = point(params.pickupLat, params.pickupLng, params.pickupLabel);
  const drop = point(params.dropLat, params.dropLng, params.dropLabel);
  return pickup && drop ? { pickup, drop } : null;
}

function minutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function km(metres: number): string {
  return `${(metres / 1000).toFixed(1)} km`;
}

export function ChooseRideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<Params>();
  const { pickupLat, pickupLng, pickupLabel, dropLat, dropLng, dropLabel } = params;
  // The router hands back a new params object on render. Key the trip on its values, so nothing
  // below re-runs (refit the map, ask for prices) unless the trip really changed.
  const trip = useMemo(
    () => tripFrom({ pickupLat, pickupLng, pickupLabel, dropLat, dropLng, dropLabel }),
    [pickupLat, pickupLng, pickupLabel, dropLat, dropLng, dropLabel],
  );
  const signedIn = useAuthStore((state) => state.status) === "signedIn";
  const [loginOpen, setLoginOpen] = useState(false);
  const [booked, setBooked] = useState(false);

  const quotes = useFareQuotes(trip, signedIn && !booked);
  const list = quotes.data?.quotes ?? [];
  // Remember the vehicle, not the quote: a fresh answer has new quote ids for the same vehicles.
  const [selectedType, setSelectedType] = useState<VehicleType | null>(null);
  const selected = list.find((q) => q.vehicle_type === selectedType) ?? list[0] ?? null;
  const route = useMemo(() => (selected ? decodePolyline(selected.route_polyline) : []), [selected]);

  const book = useMutation({
    mutationFn: (quoteId: string) => bookRide(quoteId),
    onSuccess: (ride) => {
      // The quotes are used up. Stop asking for them, and forget them so a later visit to the
      // same trip gets fresh prices.
      setBooked(true);
      queryClient.removeQueries({ queryKey: ["rides", "quotes"] });
      router.replace(`/rides/ride/${ride.id}` as never);
    },
    onError: async (error) => {
      const code = isApiRequestError(error) ? error.code : null;
      if (code === "quote_expired" || code === "quote_used") void quotes.refetch();
      if (code === "ride_already_open") {
        // A ride is already going: take the rider to it rather than refuse.
        const openId = await findOpenRide().catch(() => null);
        if (openId) router.replace(`/rides/ride/${openId}` as never);
      }
    },
  });

  const mapRef = useRef<MapView>(null);
  const pickup = trip && { latitude: Number(trip.pickup.latitude), longitude: Number(trip.pickup.longitude) };
  const drop = trip && { latitude: Number(trip.drop.latitude), longitude: Number(trip.drop.longitude) };

  // Frame the pickup and drop as soon as the map is ready, and the whole route once it arrives.
  // Only then: any other re-render must leave the rider's own zoom and pan alone.
  const [mapReady, setMapReady] = useState(false);
  const hasRoute = route.length > 0;
  const tripKey = trip ? `${trip.pickup.latitude},${trip.pickup.longitude},${trip.drop.latitude},${trip.drop.longitude}` : "";
  useEffect(() => {
    if (!mapReady) return;
    const points = hasRoute ? route : [pickup, drop].filter((p) => p !== null);
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
      animated: true,
    });
    // `route`, `pickup` and `drop` are rebuilt on every render; `tripKey` and `hasRoute` say when
    // they really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, hasRoute, tripKey]);

  // A quote lives five minutes on the server. Ask again before it ends, so the rider never sees a
  // price that can no longer be booked. One timer per answer: it restarts only when new prices
  // arrive, and prices that were kept from an earlier visit are asked for once, not repeatedly.
  const answeredAt = quotes.dataUpdatedAt;
  const hasPrices = list.length > 0;
  const { refetch } = quotes;
  useEffect(() => {
    if (!hasPrices) return;
    const wait = Math.max(0, answeredAt + QUOTES_REFRESH_MS - Date.now());
    const timer = setTimeout(() => void refetch(), wait);
    return () => clearTimeout(timer);
  }, [hasPrices, answeredAt, refetch]);

  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      className="flex-1 gap-2 bg-canvas px-4 pt-2"
    >
      <View className="min-h-40 flex-1 overflow-hidden rounded-2xl border border-line">
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          onMapReady={() => setMapReady(true)}
          userInterfaceStyle="light"
          initialRegion={
            pickup ? { ...pickup, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined
          }
        >
          {pickup && <Marker coordinate={pickup} title="Pickup" pinColor="green" />}
          {drop && <Marker coordinate={drop} title="Drop" pinColor="red" />}
          {route.length > 1 && <Polyline coordinates={route} strokeColor={ROUTE_BLUE} strokeWidth={5} />}
        </MapView>
      </View>

      <View className="max-h-[40%] rounded-2xl border border-line bg-surface p-3">
        {trip === null ? (
          <Message text="Trip details are missing. Go back and choose your pickup and drop.">
            <Button onPress={() => router.back()}>Back</Button>
          </Message>
        ) : !signedIn ? (
          <Message text="Log in to see prices for this trip.">
            <Button onPress={() => setLoginOpen(true)}>Log in</Button>
          </Message>
        ) : quotes.isPending ? (
          <View className="items-center gap-2 py-8">
            <ActivityIndicator color={ROUTE_BLUE} />
            <Text className="text-sm text-slate-500">Getting prices…</Text>
          </View>
        ) : quotes.isError ? (
          <QuoteError
            key={quotes.errorUpdatedAt}
            error={quotes.error}
            busy={quotes.isFetching}
            onRetry={() => void refetch()}
            onChangePickup={() => router.back()}
          />
        ) : (
          <>
          <ScrollView>
            {list.map((quote) => {
              const vehicle = VEHICLES[quote.vehicle_type];
              const Icon = vehicle.icon;
              const active = quote.id === selected?.id;
              return (
                <Pressable
                  key={quote.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => setSelectedType(quote.vehicle_type)}
                  className={`mb-1.5 flex-row items-center gap-3 rounded-xl border px-3 py-2 ${
                    active ? "border-blue-600 bg-blue-50" : "border-line bg-surface"
                  }`}
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                    <Icon size={26} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">{vehicle.name}</Text>
                    <Text className="text-xs text-slate-500">
                      {minutes(quote.duration_s)} · {km(quote.distance_m)}
                    </Text>
                  </View>
                  <Text className="text-base font-bold text-slate-900">{formatMoney(quote.fare_paise)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {book.isError ? (
            <Text accessibilityRole="alert" className="mt-1 text-center text-sm text-red-600">
              {bookingErrorText(book.error)}
            </Text>
          ) : null}
          {selected ? (
            <Button
              size="lg"
              block
              className="mt-1"
              loading={book.isPending}
              onPress={() => book.mutate(selected.id)}
            >
              {`Book ${VEHICLES[selected.vehicle_type].name} · ${formatMoney(selected.fare_paise)}`}
            </Button>
          ) : null}
          </>
        )}
      </View>

      <CustomerLoginSheet open={loginOpen} onOpenChange={setLoginOpen} />
    </View>
  );
}

function bookingErrorText(error: unknown): string {
  const code = isApiRequestError(error) ? error.code : null;
  if (code === "quote_expired" || code === "quote_used") return "Prices changed. Check the new price and book again.";
  if (code === "ride_already_open") return "You already have a ride going.";
  if (code === "vehicle_unavailable") return "This vehicle can't be booked here right now. Choose another.";
  return describeError(error, "mutation").message;
}

function Message({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <View className="items-center gap-4 py-6">
      <Text className="text-center text-sm text-slate-700">{text}</Text>
      {children}
    </View>
  );
}

/** Seconds the server asks us to wait, from a throttled (429) answer; 0 for any other error. */
function throttleWait(error: unknown): number {
  if (!isApiRequestError(error) || error.status !== 429) return 0;
  const details = error.details as { retry_after_seconds?: unknown } | null;
  return typeof details?.retry_after_seconds === "number" ? details.retry_after_seconds : 0;
}

/** Counts down from `seconds`, once a second. The error card is keyed per failure, so it restarts. */
function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);
  return left;
}

function QuoteError({
  error,
  busy,
  onRetry,
  onChangePickup,
}: {
  error: unknown;
  busy: boolean;
  onRetry: () => void;
  onChangePickup: () => void;
}) {
  const wait = throttleWait(error);
  const left = useCountdown(wait);
  const code = isApiRequestError(error) ? error.code : null;
  if (code === "area_not_served") {
    return (
      <Message text="Rides isn't available here yet.">
        <Button onPress={onChangePickup}>Change pickup</Button>
      </Message>
    );
  }
  if (wait > 0) {
    return (
      <Message
        text={
          left > 0
            ? `Too many price checks in a short time. You can try again in ${left} s.`
            : "You can try again now."
        }
      >
        <Button disabled={left > 0 || busy} onPress={onRetry}>
          Try again
        </Button>
      </Message>
    );
  }
  const text =
    code === "routing_unavailable"
      ? "We couldn't work out this trip right now."
      : describeError(error, "read").message;
  return (
    <Message text={text}>
      <Button disabled={busy} onPress={onRetry}>
        Try again
      </Button>
    </Message>
  );
}
