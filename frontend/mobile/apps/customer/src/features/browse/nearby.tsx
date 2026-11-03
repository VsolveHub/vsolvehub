import { MapPin } from "lucide-react-native";
import { View } from "react-native";

import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";

export interface PlaceFilterValue {
  /** What the box shows; for a picked place, its short name ("Kukatpally"). */
  name: string;
  latitude: number | null;
  longitude: number | null;
  /** `typed`: text only. `place`: a picked suggestion. `device`: the phone's location. */
  source: "typed" | "place" | "device";
}

export const EMPTY_PLACE: PlaceFilterValue = {
  name: "",
  latitude: null,
  longitude: null,
  source: "typed",
};

/** Closer than this counts as "in" the searched place. */
export const IN_PLACE_KM = 3;
/** Mirrors the server's `NEARBY_RADIUS_KM`. */
export const NEARBY_RADIUS_KM = 25;

export function hasPoint(place: PlaceFilterValue): boolean {
  return place.latitude !== null && place.longitude !== null;
}

/**
 * The browse query for a place. A point searches by distance, and the name is sent only to
 * keep a listing that has no pin yet. Near me has no name worth matching.
 */
export function placeQuery(place: PlaceFilterValue): {
  location: string;
  lat?: number;
  lng?: number;
} {
  if (place.latitude === null || place.longitude === null) return { location: place.name.trim() };
  return {
    location: place.source === "device" ? "" : place.name.trim(),
    lat: place.latitude,
    lng: place.longitude,
  };
}

/** The cache key part for a place: two searches of the same point share a page. */
export function placeKey(place: PlaceFilterValue): string {
  return hasPoint(place)
    ? `${place.latitude?.toFixed(5)},${place.longitude?.toFixed(5)}`
    : place.name.trim();
}

function placeLabel(place: PlaceFilterValue): string {
  return place.source === "device" ? "your location" : place.name;
}

/**
 * The notice above results when the page searched a point. Nothing when no point was searched,
 * or when the place has listings of its own.
 */
export function NearbyNotice({
  place,
  noun,
  count,
  nearestKm,
}: {
  place: PlaceFilterValue;
  /** Plural, e.g. "stays" or "rentals". */
  noun: string;
  count: number;
  nearestKm: number | null | undefined;
}) {
  if (!hasPoint(place)) return null;
  let text: string | null = null;
  if (count === 0) {
    text = `No ${noun} within ${NEARBY_RADIUS_KM} km of ${placeLabel(place)} yet.`;
  } else if (nearestKm == null || nearestKm > IN_PLACE_KM) {
    text =
      place.source === "device"
        ? `No ${noun} right around you yet — showing the nearest ones.`
        : `No ${noun} in ${place.name} yet — showing the nearest ones.`;
  }
  if (text === null) return null;
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-start gap-2 rounded-xl border border-warning-line bg-warning-surface p-3"
    >
      <MapPin size={16} color={COLOR_TOKENS.warningText} style={{ marginTop: 2 }} />
      <Text className="flex-1 text-xs font-medium text-warning-text leading-relaxed">
        {text}
      </Text>
    </View>
  );
}

