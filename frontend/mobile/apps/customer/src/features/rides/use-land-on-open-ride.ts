import { useAuthStore } from "@vsolve/mobile-core";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { findOpenRide } from "./queries";

/** Once per app launch, so going back to Home from the ride screen doesn't bounce the rider. */
let openRideChecked = false;

/**
 * Reopening the app lands on the ride still going (brief §5.11, item 9). Home is where the app
 * opens, so the check lives in its Pick up & Drop card. A failed check is tried again on the next
 * visit.
 */
export function useLandOnOpenRide() {
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.status) === "signedIn";

  useEffect(() => {
    if (!signedIn || openRideChecked) return;
    let cancelled = false;
    findOpenRide()
      .then((rideId) => {
        openRideChecked = true;
        if (rideId && !cancelled) router.push(`/rides/ride/${rideId}` as never);
      })
      .catch(() => {
        // Offline or the server is down: Home stays as it is.
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, router]);
}

/** For tests: forget that this launch already checked. */
export function resetOpenRideCheck() {
  openRideChecked = false;
}
