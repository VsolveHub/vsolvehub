import { Platform } from "react-native";

export type TripStep = "to_pickup" | "otp" | "in_trip" | "collect" | "done";

interface RideLike {
  state: string;
  payment_status: string;
}

/** Which trip screen the captain sees for the ride's state (brief §5.11, items 6–8). */
export function tripStep(ride: RideLike): TripStep {
  if (ride.state === "CAPTAIN_ASSIGNED") return "to_pickup";
  if (ride.state === "CAPTAIN_ARRIVED") return "otp";
  if (ride.state === "IN_TRIP") return "in_trip";
  if (ride.state === "COMPLETED" && ride.payment_status === "DUE") return "collect";
  return "done";
}

/** Turn-by-turn in Google Maps on Android (brief §5.11); the web link everywhere else. */
export function navigationUrl(latitude: string | number, longitude: string | number, os: string = Platform.OS): string {
  return os === "android"
    ? `google.navigation:q=${latitude},${longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

/** The reasons the server accepts for a captain's cancel (agreed on Day 5). */
export const CAPTAIN_CANCEL_REASONS: readonly { code: string; label: string }[] = [
  { code: "RIDER_NOT_REACHABLE", label: "Rider not reachable" },
  { code: "VEHICLE_ISSUE", label: "Vehicle problem" },
  { code: "PICKUP_TOO_FAR", label: "Pickup too far" },
  { code: "OTHER", label: "Other" },
];

/** The rider's first name only: enough to find them at the pickup. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** A typed start code is four digits. */
export function isOtpComplete(otp: string): boolean {
  return /^\d{4}$/.test(otp);
}
