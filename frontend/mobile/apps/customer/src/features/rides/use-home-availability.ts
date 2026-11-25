import { useQuery } from "@tanstack/react-query";
import { getCurrentPosition } from "@vsolve/mobile-core";

import { useAvailability } from "./queries";

/** What Home shows: each card only where the server says it can be booked (D21). */
export interface HomeAvailability {
  rides: boolean;
  parcel: boolean;
}

/** Nothing is known yet (no location, still loading, or the server did not answer). */
const UNKNOWN: HomeAvailability = { rides: true, parcel: true };

/**
 * What the server's answer means for Home. A place that is known decides, and an empty list hides
 * its card. Anything not known keeps both cards: the next screen asks for the location and says
 * "isn't available here yet", rather than Home hiding a product from a customer it never asked.
 */
export function homeAvailability(
  answer: { vehicle_types: readonly unknown[]; parcel: readonly unknown[] } | undefined,
): HomeAvailability {
  if (!answer) return UNKNOWN;
  return { rides: answer.vehicle_types.length > 0, parcel: answer.parcel.length > 0 };
}

/**
 * The phone's recent place, for Home only. It never asks for permission and never waits long:
 * with no recent fix, or location off, the place is unknown and Home keeps both cards.
 */
function useHomePlace(enabled: boolean) {
  return useQuery({
    queryKey: ["rides", "home-place"],
    queryFn: async () => {
      try {
        const { coords } = await getCurrentPosition({ prompt: false, maxAgeMs: 10 * 60_000, timeoutMs: 5_000 });
        return { latitude: coords.latitude, longitude: coords.longitude };
      } catch {
        return null;
      }
    },
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Which of the Rides and Pick up & Drop cards Home shows. */
export function useHomeAvailability(enabled: boolean): HomeAvailability {
  const place = useHomePlace(enabled);
  const availability = useAvailability(place.data ?? null);
  return homeAvailability(availability.data);
}
