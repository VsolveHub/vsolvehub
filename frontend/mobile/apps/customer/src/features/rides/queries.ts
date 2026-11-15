import { useQuery } from "@tanstack/react-query";
import {
  clearIdempotencyKey,
  getStableIdempotencyKey,
  isApiRequestError,
  request,
  type Schemas,
} from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";

export type FareQuote = Schemas["FareQuote"];
export type TripPoint = Schemas["TripPointRequest"];

export interface Trip {
  pickup: TripPoint;
  drop: TripPoint;
}

/**
 * Upfront fares for a trip. Each call saves new quotes on the server and counts against a limit of
 * 20 a minute, so this asks once and keeps the answer for as long as it can be booked (the server
 * keeps a quote 5 minutes). It never refetches on its own: not on focus, reconnect, remount or
 * retry, and a failed call is not repeated by a remount. The screen asks again only when the quotes
 * expire, or when the rider taps Try again.
 */
const QUOTES_KEPT_MS = 4 * 60 * 1000;

export function useFareQuotes(trip: Trip | null, enabled: boolean) {
  return useQuery({
    queryKey: ["rides", "quotes", trip],
    queryFn: () => request(() => getApiClient().POST("/api/v1/rides/quotes/", { body: trip! })),
    enabled: enabled && trip !== null,
    staleTime: Infinity,
    gcTime: QUOTES_KEPT_MS,
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export interface Place {
  latitude: number;
  longitude: number;
}

export type Ride = Schemas["Ride"];

/** States in which the ride is still going: the screen keeps checking it. */
export const OPEN_RIDE_STATES = ["SEARCHING", "CAPTAIN_ASSIGNED", "CAPTAIN_ARRIVED", "IN_TRIP"] as const;

export function isOpenRide(state: string): boolean {
  return (OPEN_RIDE_STATES as readonly string[]).includes(state);
}

export function rideKey(rideId: string) {
  return ["rides", "ride", rideId] as const;
}

/**
 * Book a ride from a quote. One idempotency key per quote until it settles, so a double tap or a
 * retry after a timeout books once (brief §5.10).
 */
export async function bookRide(quoteId: string): Promise<Ride> {
  const scope = `rides.book.${quoteId}`;
  try {
    const ride = await request(() =>
      getApiClient().POST("/api/v1/rides/", {
        body: { quote_id: quoteId },
        params: { header: { "Idempotency-Key": getStableIdempotencyKey(scope) } },
      }),
    );
    clearIdempotencyKey(scope);
    return ride;
  } catch (error) {
    if (isApiRequestError(error) && !error.retryable) clearIdempotencyKey(scope);
    throw error;
  }
}

/** The live ride, checked every 3 s while it is still going (brief §5.7). */
export function useRide(rideId: string) {
  return useQuery({
    queryKey: rideKey(rideId),
    queryFn: () =>
      request(() => getApiClient().GET("/api/v1/rides/{ride_id}/", { params: { path: { ride_id: rideId } } })),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === undefined || isOpenRide(state) ? 3000 : false;
    },
  });
}

export function cancelRide(rideId: string, reason: string): Promise<Ride> {
  return request(() =>
    getApiClient().POST("/api/v1/rides/{ride_id}/cancel/", {
      params: { path: { ride_id: rideId } },
      body: { reason },
    }),
  );
}

/** The rider's ride still going, if any (newest first, so the first page is enough). */
export async function findOpenRide(): Promise<string | null> {
  const page = await request(() => getApiClient().GET("/api/v1/rides/"));
  return page.results.find((ride) => isOpenRide(ride.state))?.id ?? null;
}

export async function rateCaptain(rideId: string, stars: number): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/rides/{ride_id}/rating/", { params: { path: { ride_id: rideId } }, body: { stars } }),
  );
}

export type SosAnswer = Schemas["Sos"];

/** SOS with the phone's last known place, if it has one; the server never refuses for lack of it. */
export function raiseRiderSos(rideId: string, place: Place | null): Promise<SosAnswer> {
  const body = place
    ? { latitude: place.latitude.toFixed(6), longitude: place.longitude.toFixed(6) }
    : {};
  return request(() =>
    getApiClient().POST("/api/v1/rides/{ride_id}/sos/", { params: { path: { ride_id: rideId } }, body }),
  );
}

export type RideHistoryRow = Schemas["RideHistory"];

/** The rider's rides, newest first (the first page). */
export function useRideHistory() {
  return useQuery({
    queryKey: ["rides", "history"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/rides/")),
  });
}
