import { useMutation } from "@tanstack/react-query";
import { isApiRequestError } from "@vsolve/api-client";
import { useAuthStore } from "@vsolve/mobile-core";
import { Button, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";

import { decodePolyline } from "../polyline";
import { bookRide, findOpenRide, useFareQuotes, type Trip } from "../queries";
import { VEHICLES } from "../vehicles";

const ROUTE_BLUE = "#2563EB";

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
  const params = useLocalSearchParams<Params>();
  const trip = useMemo(() => tripFrom(params), [params]);
  const signedIn = useAuthStore((state) => state.status) === "signedIn";
  const [loginOpen, setLoginOpen] = useState(false);

  const quotes = useFareQuotes(trip, signedIn);
  const list = quotes.data?.quotes ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = list.find((q) => q.id === selectedId) ?? list[0] ?? null;
  const route = useMemo(() => (selected ? decodePolyline(selected.route_polyline) : []), [selected]);

  const book = useMutation({
    mutationFn: (quoteId: string) => bookRide(quoteId),
    onSuccess: (ride) => router.replace(`/rides/ride/${ride.id}` as never),
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

  // Fit the whole route above the sheet once it arrives.
  useEffect(() => {
    const points = route.length > 0 ? route : [pickup, drop].filter((p) => p !== null);
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 60, right: 40, bottom: 380, left: 40 },
      animated: true,
    });
    // Coordinates are derived from `route` and `trip`; refit only when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, trip]);

  // A quote lives five minutes on the server. Ask again just after it ends, so the rider never
  // sees a price that can no longer be booked.
  const expiresAt = list[0]?.expires_at;
  const { refetch } = quotes;
  useEffect(() => {
    if (!expiresAt) return;
    const wait = Math.max(0, new Date(expiresAt).getTime() - Date.now()) + 500;
    const timer = setTimeout(() => void refetch(), wait);
    return () => clearTimeout(timer);
  }, [expiresAt, refetch]);

  return (
    <View className="flex-1 bg-canvas">
      <MapView
        ref={mapRef}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        userInterfaceStyle="light"
        initialRegion={
          pickup ? { ...pickup, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined
        }
      >
        {pickup && <Marker coordinate={pickup} title="Pickup" pinColor="green" />}
        {drop && <Marker coordinate={drop} title="Drop" pinColor="red" />}
        {route.length > 1 && <Polyline coordinates={route} strokeColor={ROUTE_BLUE} strokeWidth={5} />}
      </MapView>

      <View className="absolute bottom-0 left-0 right-0 max-h-[60%] rounded-t-3xl bg-white px-4 pb-8 pt-4 shadow-lg">
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
          <QuoteError error={quotes.error} onRetry={() => void refetch()} onChangePickup={() => router.back()} />
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
                  onPress={() => setSelectedId(quote.id)}
                  className={`mb-2 flex-row items-center gap-3 rounded-2xl border p-3 ${
                    active ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-slate-100">
                    <Icon size={24} color="#0F172A" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-slate-900">{vehicle.name}</Text>
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
              className="mt-2"
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

function QuoteError({
  error,
  onRetry,
  onChangePickup,
}: {
  error: unknown;
  onRetry: () => void;
  onChangePickup: () => void;
}) {
  const code = isApiRequestError(error) ? error.code : null;
  if (code === "area_not_served") {
    return (
      <Message text="Rides aren't available at this pickup yet.">
        <Button onPress={onChangePickup}>Change pickup</Button>
      </Message>
    );
  }
  const text =
    code === "routing_unavailable"
      ? "We couldn't work out this trip right now."
      : describeError(error, "read").message;
  return (
    <Message text={text}>
      <Button onPress={onRetry}>Try again</Button>
    </Message>
  );
}
