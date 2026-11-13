import { usePlaceSearch, useReverseGeocode, type PlaceSuggestion } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { ArrowLeft, LocateFixed, MapPin, Search } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker, type MapPressEvent } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Place {
  latitude: number;
  longitude: number;
  label: string;
}

type Field = "pickup" | "drop";
type PickupStatus = "locating" | "ready" | "denied" | "failed";

// The server refuses a search shorter than this (`PlaceSearchQuerySerializer`).
const MIN_SEARCH_CHARS = 3;
const SEARCH_PAUSE_MS = 250;

// Token values from guide/03-design-system.md, for props that take a colour and not a class.
const NAVY = "#00246b";
const MUTED = "#756c5e";
const SIGNAL = "#f87000";
const DANGER = "#b3261e";

/** "Forum Mall, Koramangala, Bengaluru" -> a bold name and a grey line for the rest. */
function splitLabel(label: string): { title: string; subtitle: string } {
  const [title, ...rest] = label.split(",");
  return { title: (title ?? label).trim(), subtitle: rest.join(",").trim() };
}

/**
 * Where to: opens as a search list, like a ride app does, not as a map. The map is one tap away
 * ("Set location on map") and only used to drop a pin.
 */
export function WhereToScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const reverse = useReverseGeocode();

  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [pickupStatus, setPickupStatus] = useState<PickupStatus>("locating");
  // The field being typed into. Drop first: that is what the rider came to do.
  const [active, setActive] = useState<Field | null>("drop");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [mapMode, setMapMode] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const search = usePlaceSearch(active ? debounced : "");
  const results = search.data?.results ?? [];
  const showResults = active !== null && debounced.trim().length >= MIN_SEARCH_CHARS;

  const setters = { pickup: setPickup, drop: setDrop };

  function activate(field: Field | null) {
    setActive(field);
    setQuery("");
    setDebounced("");
  }

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
    // Move on to the next empty field, or close the editor.
    const next = field === "pickup" && !drop ? "drop" : null;
    activate(next);
    if (next === null) Keyboard.dismiss();
  }

  function handleMapPress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const field = active ?? "drop";
    placeAt(field, latitude, longitude, "Pinned location");
    if (field === "pickup") setPickupStatus("ready");
    activate(null);
    setMapMode(false);
  }

  function openMap() {
    Keyboard.dismiss();
    setMapMode(true);
  }

  function next() {
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

  if (mapMode) {
    const start = pickup ?? drop;
    return (
      <View
        style={{ paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) }}
        className="flex-1 gap-3 bg-canvas px-4"
      >
        <View className="min-h-40 flex-1 overflow-hidden rounded-2xl border border-line">
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={
              start
                ? { latitude: start.latitude, longitude: start.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
                : undefined
            }
            onPress={handleMapPress}
            userInterfaceStyle="light"
            showsUserLocation
          >
            {pickup && <Marker coordinate={pickup} title="Pickup" pinColor={NAVY} />}
            {drop && <Marker coordinate={drop} title="Drop" pinColor={SIGNAL} />}
          </MapView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to search"
            onPress={() => setMapMode(false)}
            className="absolute left-3 top-3 h-11 w-11 items-center justify-center rounded-full bg-surface shadow-lg active:bg-surface-hover"
          >
            <ArrowLeft size={22} color={NAVY} />
          </Pressable>
        </View>
        <View className="rounded-2xl border border-line bg-surface p-4">
          <Text className="text-base font-bold text-text">
            {`Tap the map to set your ${(active ?? "drop") === "pickup" ? "pickup" : "drop-off"}`}
          </Text>
        </View>
      </View>
    );
  }

  function renderField(field: Field, value: Place | null, placeholder: string) {
    if (active === field) {
      return (
        <View className="min-h-11 flex-row items-center gap-2 rounded-control border border-selected bg-surface px-3">
          <Search size={16} color={MUTED} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={MUTED}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={placeholder}
            className="flex-1 py-2 text-base text-text"
          />
        </View>
      );
    }
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        onPress={() => activate(field)}
        className="min-h-11 justify-center rounded-control bg-surface-sunken px-3 active:bg-surface-hover"
      >
        <Text numberOfLines={1} className={value ? "text-base text-text" : "text-base text-text-muted"}>
          {value?.label ?? placeholder}
        </Text>
      </Pressable>
    );
  }

  const activeName = active === "pickup" ? "pickup" : "drop-off";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ paddingTop: insets.top }}
      className="flex-1 bg-canvas"
    >
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => router.back()}>
          <ArrowLeft size={24} color={NAVY} />
        </Pressable>
        <Text className="flex-1 text-xl font-extrabold text-text">Where to?</Text>
        <Pressable accessibilityRole="link" hitSlop={10} onPress={() => router.push("/rides/history" as never)}>
          <Text className="text-sm font-semibold text-text-link">Your rides</Text>
        </Pressable>
      </View>

      <View className="mx-4 flex-row gap-3 rounded-card border border-line bg-surface p-3">
        {/* Pickup dot, connector line, drop square */}
        <View className="items-center py-4">
          <View className="h-2.5 w-2.5 rounded-full border-2 border-selected" />
          <View className="my-1 w-0.5 flex-1 bg-line-strong" />
          <View className="h-2.5 w-2.5 bg-selected" />
        </View>
        <View className="flex-1 gap-2">
          {pickupStatus === "locating" && active !== "pickup" ? (
            <View className="min-h-11 flex-row items-center gap-2 rounded-control bg-surface-sunken px-3">
              <ActivityIndicator size="small" color={NAVY} />
              <Text className="text-base text-text-muted">Finding your location…</Text>
            </View>
          ) : (
            renderField("pickup", pickup, "Pickup location")
          )}
          {renderField("drop", drop, "Where to?")}
        </View>
      </View>

      {pickupStatus === "locating" && !pickup ? (
        <Text className="mx-4 mt-3 text-xs text-text-muted">We use your location to find your pickup.</Text>
      ) : null}
      {pickupStatus === "denied" && !pickup ? (
        <Pressable onPress={() => Linking.openSettings()} className="mx-4 mt-3 flex-row items-center gap-1.5">
          <LocateFixed size={14} color={DANGER} />
          <Text className="flex-1 text-xs text-danger-text">
            Location is off. We use it to find your pickup. Tap to allow, or type your pickup.
          </Text>
        </Pressable>
      ) : null}
      {pickupStatus === "failed" && !pickup ? (
        <Text className="mx-4 mt-3 text-xs text-danger-text">We couldn&apos;t find your location. Type your pickup.</Text>
      ) : null}

      <ScrollView className="mt-2 flex-1" keyboardShouldPersistTaps="handled">
        {active && !showResults ? (
          <Text className="px-4 py-3 text-sm text-text-muted">
            {`Type at least ${MIN_SEARCH_CHARS} letters of the ${activeName} place.`}
          </Text>
        ) : null}

        {showResults ? (
          search.isFetching && results.length === 0 ? (
            <View className="flex-row items-center gap-2 px-4 py-4">
              <ActivityIndicator size="small" color={NAVY} />
              <Text className="text-sm text-text-muted">Searching…</Text>
            </View>
          ) : search.isError ? (
            <Text accessibilityRole="alert" className="px-4 py-4 text-sm text-danger-text">
              {describeError(search.error, "read").message}
            </Text>
          ) : results.length === 0 ? (
            <Text className="px-4 py-4 text-sm text-text-muted">
              No matching place. Try a nearby landmark, or set it on the map.
            </Text>
          ) : (
            results.map((place, index) => {
              const { title, subtitle } = splitLabel(place.label);
              return (
                <Pressable
                  key={`${place.latitude},${place.longitude},${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={place.label}
                  onPress={() => active && handlePick(active, place)}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken">
                    <MapPin size={20} color={NAVY} />
                  </View>
                  <View className="flex-1 border-b border-line pb-3">
                    <Text numberOfLines={1} className="text-base font-semibold text-text">
                      {title}
                    </Text>
                    {subtitle ? (
                      <Text numberOfLines={1} className="text-sm text-text-muted">
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set location on map"
          onPress={openMap}
          className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-action-surface">
            <MapPin size={20} color={SIGNAL} />
          </View>
          <Text className="text-base font-semibold text-text">Set location on map</Text>
        </Pressable>
      </ScrollView>

      {pickup && drop ? (
        <View style={{ paddingBottom: insets.bottom + 12 }} className="border-t border-line bg-surface px-4 pt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={next}
            className="min-h-touch items-center justify-center rounded-control bg-action active:bg-action-active"
          >
            <Text className="text-base font-bold text-action-text">Continue</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
