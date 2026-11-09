import { useQuery } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

export type FareQuote = Schemas["FareQuote"];
export type TripPoint = Schemas["TripPointRequest"];

export interface Trip {
  pickup: TripPoint;
  drop: TripPoint;
}

/**
 * Upfront fares for a trip. Each call saves new quotes on the server, so this never refetches on
 * its own (focus, reconnect, retry); the screen asks again only when the quotes expire.
 */
export function useFareQuotes(trip: Trip | null, enabled: boolean) {
  return useQuery({
    queryKey: ["rides", "quotes", trip],
    queryFn: () => request(() => getApiClient().POST("/api/v1/rides/quotes/", { body: trip! })),
    enabled: enabled && trip !== null,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export interface Place {
  latitude: number;
  longitude: number;
}

/**
 * Which vehicle types can be booked at a place: drives the Rides entry on Home. The place is
 * rounded to about 100 m in the key, so small GPS jitter does not ask the server again.
 */
export function useRidesAvailability(place: Place | null) {
  return useQuery({
    queryKey: ["rides", "availability", place?.latitude.toFixed(3), place?.longitude.toFixed(3)],
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/rides/availability/", {
          params: {
            query: { latitude: place!.latitude.toFixed(6), longitude: place!.longitude.toFixed(6) },
          },
        }),
      ),
    enabled: place !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
