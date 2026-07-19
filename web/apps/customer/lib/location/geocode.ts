"use client";

/**
 * Shared client helpers for geolocation + reverse geocoding.
 * Used by the address picker, profile address manager, and vehicle flows so
 * "Use my current location" behaves identically everywhere.
 */

export type DetectedLocation = {
  lat: number;
  lng: number;
  houseNumber: string;
  road: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  fullAddress: string;
  displayName: string;
};

export class LocationError extends Error {
  constructor(
    message: string,
    public code: "unsupported" | "denied" | "unavailable" | "timeout" | "geocode" = "unavailable"
  ) {
    super(message);
    this.name = "LocationError";
  }
}

export function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationError("Location isn't supported on this device.", "unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        reject(new LocationError("Location permission was denied. Please allow access or enter manually.", "denied"));
      } else if (err.code === err.TIMEOUT) {
        reject(new LocationError("Getting your location timed out. Please try again.", "timeout"));
      } else {
        reject(new LocationError("Couldn't determine your location. Please enter it manually.", "unavailable"));
      }
    }, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
      ...options,
    });
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<Partial<DetectedLocation>> {
  const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    throw new LocationError("We found your position but couldn't read the address.", "geocode");
  }
  return res.json();
}

/**
 * Request the user's position (triggers the browser permission prompt) and
 * resolve it to a structured address. If reverse geocoding fails we still
 * return the raw coordinates so callers can save/use the location.
 */
export async function detectCurrentLocation(options?: PositionOptions): Promise<DetectedLocation> {
  const pos = await getCurrentPosition(options);
  const { latitude: lat, longitude: lng } = pos.coords;

  const empty: DetectedLocation = {
    lat,
    lng,
    houseNumber: "",
    road: "",
    area: "",
    city: "",
    state: "",
    pincode: "",
    fullAddress: "",
    displayName: "",
  };

  try {
    const geo = await reverseGeocode(lat, lng);
    return { ...empty, ...geo, lat, lng };
  } catch {
    return empty;
  }
}

/** Short, human-friendly label for headers and chips. */
export function formatLocationLabel(parts: {
  area?: string | null;
  city?: string | null;
  fullAddress?: string | null;
  label?: string | null;
}): string {
  const area = parts.area?.trim();
  const city = parts.city?.trim();
  if (area && city) return `${area}, ${city}`;
  if (area) return area;
  if (city) return city;
  const full = parts.fullAddress?.trim();
  if (full) return full.length > 40 ? `${full.slice(0, 40)}…` : full;
  return parts.label?.trim() || "Select Address";
}

/* ---- Persisted active location (shared by header + pickers) ---- */

export const DEFAULT_LOCATION_LABEL = "Select Address";

const KEYS = {
  id: "location_id",
  area: "user_area",
  city: "user_city",
  address: "user_address",
  label: "user_location_label",
} as const;

import { getCookie, setCookie, removeCookie } from "@/lib/cookies";

export type StoredLocation = {
  id?: string | null;
  label?: string | null;
  area?: string | null;
  city?: string | null;
  fullAddress?: string | null;
};

/** Persist the active location and notify listeners. Returns the display label. */
export function storeActiveLocation(loc: StoredLocation): string {
  if (typeof window === "undefined") return DEFAULT_LOCATION_LABEL;
  if (loc.id) setCookie(KEYS.id, loc.id);
  else removeCookie(KEYS.id);
  setCookie(KEYS.area, loc.area ?? "");
  setCookie(KEYS.city, loc.city ?? "");
  setCookie(KEYS.address, loc.fullAddress ?? "");
  const display = formatLocationLabel(loc);
  setCookie(KEYS.label, display);
  window.dispatchEvent(new Event("location_updated"));
  return display;
}

/** Read the active location display label, or null if none is set. */
export function readActiveLocationLabel(): string | null {
  if (typeof window === "undefined") return null;
  const label = getCookie(KEYS.label);
  if (label) return label;
  const area = getCookie(KEYS.area);
  const city = getCookie(KEYS.city);
  const address = getCookie(KEYS.address);
  if (area || city || address) {
    return formatLocationLabel({ area, city, fullAddress: address });
  }
  return null;
}
