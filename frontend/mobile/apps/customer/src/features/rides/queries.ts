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
