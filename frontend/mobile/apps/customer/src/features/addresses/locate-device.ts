// Ported from frontend/apps/customer/features/addresses/locate-device.ts
/**
 * Device geolocation for the address picker.
 *
 * Shared by checkout and the crew booking form so the permission prompt, the
 * timeout and the copy a Customer reads when it fails are the same in both
 * places. The pin is requested on a button click (a user gesture) so the
 * browser prompt is not swallowed by a dialog's focus trap.
 *
 * `maximumAge: 0` so a second press in the same session asks the device again
 * rather than reusing a cached fix.
 */

export const LOCATE_DENIED =
  "Location access was denied. Allow it in your browser settings, or add the address manually.";

export const LOCATE_FAILED =
  "Couldn't get your location. Add the address manually instead.";

const GEO_TIMEOUT_MS = 10_000;

export function locateErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    if ((error as GeolocationPositionError).code === 1) return LOCATE_DENIED;
  }
  return LOCATE_FAILED;
}

export function getDevicePosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: GEO_TIMEOUT_MS,
    });
  });
}

/** Coordinates with empty address text, used when reverse geocoding fails. */
export function coordsOnlyAddress(
  latitude: string,
  longitude: string,
): {
  formatted_address: string;
  line1: string;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  latitude: string;
  longitude: string;
  provider: string;
} {
  return {
    formatted_address: "",
    line1: "",
    locality: "",
    city: "",
    state: "",
    postal_code: "",
    country_code: "IN",
    latitude,
    longitude,
    provider: "device",
  };
}
