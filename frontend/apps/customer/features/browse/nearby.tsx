"use client";

import { MapPin } from "lucide-react";
import type { PlaceFilterValue } from "@vsolve/ui/location-picker";

/**
 * "In this place, else nearby" on the stays and rentals browse pages.
 *
 * With a picked place or Near me the server returns listings within 25 km, nearest first. When
 * the nearest is still a few km off, the place itself has none, and the page says so instead
 * of passing nearby listings off as "in Kukatpally".
 */

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
 * The line above results when the page searched a point. Nothing when no point was searched,
 * or when the place has listings of its own.
 */
export function NearbyNotice({
  place,
  noun,
  count,
  nearestKm,
}: {
  place: PlaceFilterValue;
  /** Plural, e.g. "stays". */
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
    <p
      role="status"
      className="flex items-start gap-2 rounded-control border border-warning-line bg-warning-surface px-3.5 py-2.5 text-sm font-medium text-warning-text"
    >
      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
