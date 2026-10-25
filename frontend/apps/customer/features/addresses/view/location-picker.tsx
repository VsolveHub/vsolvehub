"use client";

import {
  LocationPicker as SharedLocationPicker,
  type LocationPickerProps as SharedProps,
} from "@vsolve/ui/location-picker";
import { useCallback } from "react";

import { GOOGLE_MAPS_KEY } from "@/lib/google-maps";

import { useReverseGeocode, type ResolvedLocation } from "../queries";

/**
 * The shared map picker with the Customer app's key and server lookup.
 *
 * Everything about how the pin is placed lives in `@vsolve/ui/location-picker`;
 * this only says where the address text comes from (`POST /geocoding/reverse/`
 * through this app's client) and which browser key loads the map.
 */

export interface LocationPickerProps
  extends Omit<SharedProps, "apiKey" | "reverseGeocode" | "onConfirm"> {
  onConfirm: (location: ResolvedLocation) => void;
}

export function LocationPicker(props: LocationPickerProps) {
  const { mutateAsync } = useReverseGeocode();
  const reverseGeocode = useCallback(
    (point: { latitude: string; longitude: string }) => mutateAsync(point),
    [mutateAsync],
  );
  return <SharedLocationPicker {...props} apiKey={GOOGLE_MAPS_KEY} reverseGeocode={reverseGeocode} />;
}
