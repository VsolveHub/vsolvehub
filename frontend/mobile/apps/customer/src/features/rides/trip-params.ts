import type { Trip } from "./queries";

/** What the Where-to screen hands to the next one, as route parameters. */
export type TripParams = Record<
  "pickupLat" | "pickupLng" | "pickupLabel" | "dropLat" | "dropLng" | "dropLabel",
  string
>;

/** The trip from the Where-to screen, or null if any part is missing or not a number. */
export function tripFrom(params: Partial<TripParams>): Trip | null {
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
