import { PlaceSearch, useReverseGeocode, type PlaceSuggestion } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { ArrowLeft, LocateFixed } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import MapView, { Marker, type MapPressEvent } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Place {
  latitude: number;
  longitude: number;
  label: string;
}

type Field = "pickup" | "drop";
type PickupStatus = "locating" | "ready" | "denied" | "failed";

export function WhereToScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const reverse = useReverseGeocode();

  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [pickupStatus, setPickupStatus] = useState<PickupStatus>("locating");
  // The field being typed into; map taps also fill this one.
  const [active, setActive] = useState<Field | null>(null);

  function focus(place: Place) {
    mapRef.current?.animateToRegion(
      { latitude: place.latitude, longitude: place.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      300,
    );
  }

  const setters = { pickup: setPickup, drop: setDrop };

  // Set a place now, then swap its label for the street address once the server answers.
  function placeAt(field: Field, latitude: number, longitude: number, label: string) {
    const set = setters[field];
    set({ latitude, longitude, label });
    reverse.mutate(
      { latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) },
      { onSuccess: (res) => set((p) => (p ? { ...p, label: res.formatted_address || p.label } : p)) },
    );
  }

  // Current location as the default pickup. No fallback city: if we can't locate,
  // we say so and let the rider type the pickup instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!cancelled) setPickupStatus("denied");
          return;
        }
        const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        placeAt("pickup", coords.latitude, coords.longitude, "Your location");
        setPickupStatus("ready");
        setActive("drop");
        focus({ latitude: coords.latitude, longitude: coords.longitude, label: "" });
      } catch {
        if (!cancelled) setPickupStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePick(field: Field, s: PlaceSuggestion) {
    const place = { label: s.label, latitude: Number(s.latitude), longitude: Number(s.longitude) };
    setters[field](place);
    if (field === "pickup") setPickupStatus("ready");
    focus(place);
    // Move on to the next empty field, or close the editor.
    setActive(field === "pickup" && !drop ? "drop" : null);
  }

  function handleMapPress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const field = active ?? "drop";
    placeAt(field, latitude, longitude, "Pinned location");
    if (field === "pickup") setPickupStatus("ready");
    setActive(null);
  }

  function search() {
    if (!pickup || !drop) return;
    router.push({
      pathname: "/rides/choose-ride",
      params: {
        pickupLat: String(pickup.latitude),
        pickupLng: String(pickup.longitude),
        pickupLabel: pickup.label,
        dropLat: String(drop.latitude),
        dropLng: String(drop.longitude),
        dropLabel: drop.label,
      },
    });
  }

  function renderField(field: Field, value: Place | null, placeholder: string) {
    if (active === field) {
      return (
        <PlaceSearch
          placeholder={placeholder}
          onPick={(s) => handlePick(field, s)}
          inputStyle={{ borderWidth: 0, backgroundColor: "#F3F4F6", minHeight: 40, fontSize: 14 }}
        />
      );
    }
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        onPress={() => setActive(field)}
        className="min-h-10 justify-center rounded-xl bg-gray-100 px-3"
      >
        <Text numberOfLines={1} className={value ? "text-sm text-slate-900" : "text-sm text-slate-400"}>
          {value?.label ?? placeholder}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <MapView
        ref={mapRef}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        onPress={handleMapPress}
        userInterfaceStyle="light"
        showsUserLocation
      >
        {pickup && <Marker coordinate={pickup} title="Pickup" pinColor="green" />}
        {drop && <Marker coordinate={drop} title="Drop" pinColor="red" />}
      </MapView>

      <View
        style={{ marginTop: insets.top + 8 }}
        className="mx-3 rounded-2xl bg-white p-4 shadow-lg"
      >
        <View className="mb-3 flex-row items-center gap-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()}>
            <ArrowLeft size={22} color="#111827" />
          </Pressable>
          <Text className="text-lg font-bold text-slate-900">Find a trip</Text>
        </View>

        <View className="flex-row gap-3">
          {/* Pickup dot, connector line, drop square */}
          <View className="items-center pt-4">
            <View className="h-2.5 w-2.5 rounded-full border-2 border-blue-600" />
            <View className="my-1 w-0.5 flex-1 bg-blue-600" />
            <View className="mb-4 h-2.5 w-2.5 bg-blue-600" />
          </View>
          <View className="flex-1 gap-2">
            {pickupStatus === "locating" && active !== "pickup" ? (
              <View className="min-h-10 flex-row items-center gap-2 rounded-xl bg-gray-100 px-3">
                <ActivityIndicator size="small" />
                <Text className="text-sm text-slate-500">Finding your location…</Text>
              </View>
            ) : (
              renderField("pickup", pickup, "Add a pick-up location")
            )}
            {renderField("drop", drop, "Add a drop-off location")}
          </View>
        </View>

        {pickupStatus === "denied" && !pickup ? (
          <Pressable onPress={() => Linking.openSettings()} className="mt-2 flex-row items-center gap-1.5">
            <LocateFixed size={14} color="#B91C1C" />
            <Text className="text-xs text-red-700">Location is off. Tap to allow, or type your pickup.</Text>
          </Pressable>
        ) : null}
        {pickupStatus === "failed" && !pickup ? (
          <Text className="mt-2 text-xs text-red-700">We couldn&apos;t find your location. Type your pickup.</Text>
        ) : null}
        {active ? <Text className="mt-2 text-xs text-slate-500">Or tap the map to set it.</Text> : null}

        {pickup && drop ? (
          <Pressable
            accessibilityRole="button"
            onPress={search}
            className="mt-3 items-center rounded-xl bg-slate-900 py-3 active:opacity-80"
          >
            <Text className="text-sm font-bold text-white">Search</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
