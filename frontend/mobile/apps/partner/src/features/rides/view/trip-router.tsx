import { useState } from "react";

import { useCurrentRide } from "../queries";
import { ParcelTripScreen } from "./parcel-trip-screen";
import { TripScreen } from "./trip-screen";

/**
 * The captain's job screen: the parcel screen for a Pick up & Drop job, the Rides trip screen for
 * a ride. Once a job is known to be a parcel it stays the parcel screen, even after the server
 * stops returning it as current, so the "done" summary is not swapped for the ride screen.
 */
export function TripRouter() {
  const current = useCurrentRide();
  const [sawParcel, setSawParcel] = useState(false);
  const isParcel = current.data?.ride?.kind === "PARCEL";
  // React's "adjust state while rendering": remember it once, so the screen is not swapped later.
  if (isParcel && !sawParcel) setSawParcel(true);
  return isParcel || sawParcel ? <ParcelTripScreen /> : <TripScreen />;
}
