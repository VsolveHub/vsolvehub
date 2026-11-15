import {
  clearIdempotencyKey,
  getStableIdempotencyKey,
  isApiRequestError,
  request,
  type Schemas,
} from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";

export type CaptainVehicleInput = Schemas["CaptainVehicleWriteRequest"];
export type RideHistoryRow = Schemas["RideHistory"];

export const captainStatusKey = ["rides", "me"] as const;

/**
 * Where the partner stands as a captain (`GET partner/rides/me/`). Captains are Android only in
 * V1, so an iPhone never asks: it never shows the Rides workspace.
 */
export function useCaptainStatus(enabled = true) {
  return useQuery({
    queryKey: captainStatusKey,
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/rides/me/")),
    enabled: enabled && Platform.OS === "android",
    staleTime: 30_000,
  });
}

/** Save the captain's vehicle. Allowed only while the application is still a draft. */
export function useSaveVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CaptainVehicleInput) =>
      request(() => getApiClient().PUT("/api/v1/partner/rides/vehicle/", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: captainStatusKey }),
  });
}

/** The captain's rides, newest first: the first page is plenty for the Rides tab. */
export function useCaptainHistory() {
  return useQuery({
    queryKey: ["rides", "history"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/rides/history/")),
  });
}

export type PassPlan = Schemas["CaptainPassPlan"];
export type CaptainPass = Schemas["CaptainPass"];
export type Earnings = Schemas["Earnings"];
export type EarningsPeriod = "today" | "week";

export const passesKey = ["rides", "passes"] as const;

export function usePassPlans() {
  return useQuery({
    queryKey: ["rides", "pass-plans"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/rides/pass-plans/")),
  });
}

export function useMyPasses() {
  return useQuery({
    queryKey: passesKey,
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/rides/passes/")),
  });
}

export function useEarnings(period: EarningsPeriod) {
  return useQuery({
    queryKey: ["rides", "earnings", period],
    queryFn: () =>
      request(() => getApiClient().GET("/api/v1/partner/rides/earnings/", { params: { query: { period } } })),
  });
}

/** One idempotency key per plan until the purchase settles, so a retry or double tap pays once. */
export function passPurchaseScope(planId: string): string {
  return `rides.pass.${planId}`;
}

/** Start buying a pass: active at once for a ₹0 plan, else a payment attempt to pay. */
export async function buyPass(planId: string): Promise<CaptainPass> {
  const scope = passPurchaseScope(planId);
  try {
    const bought = await request(() =>
      getApiClient().POST("/api/v1/partner/rides/passes/", {
        body: { plan_id: planId },
        params: { header: { "Idempotency-Key": getStableIdempotencyKey(scope) } },
      }),
    );
    clearIdempotencyKey(scope);
    return bought;
  } catch (error) {
    // A refusal is final (already active, another payment in flight, not approved): the next
    // tap is a new purchase. A network failure keeps the key, so a retry is the same purchase.
    if (isApiRequestError(error) && !error.retryable) clearIdempotencyKey(scope);
    throw error;
  }
}

export type RideOffer = Schemas["RideOffer"];
export type CaptainRide = Schemas["CaptainRide"];

export const currentOfferKey = ["rides", "offer", "current"] as const;
export const currentRideKey = ["rides", "ride", "current"] as const;

/**
 * The ride request to show now, checked every 2 s while on duty and the app is open (brief
 * §5.7). In the background React Query pauses it; the push alert covers that.
 */
export function useCurrentOffer(enabled: boolean) {
  return useQuery({
    queryKey: currentOfferKey,
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/rides/offers/current/")),
    enabled,
    refetchInterval: enabled ? 2000 : false,
    retry: false,
  });
}

/** The captain's open ride, or one finished but not yet marked paid. */
export function useCurrentRide(enabled = true) {
  return useQuery({
    queryKey: currentRideKey,
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/rides/current/")),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

/** Take the ride. One key per offer, so a retry after a timeout returns the same ride. */
export async function acceptOffer(offerId: string): Promise<CaptainRide> {
  const scope = `rides.accept.${offerId}`;
  try {
    const ride = await request(() =>
      getApiClient().POST("/api/v1/partner/rides/offers/{offer_id}/accept/", {
        params: { path: { offer_id: offerId }, header: { "Idempotency-Key": getStableIdempotencyKey(scope) } },
      }),
    );
    clearIdempotencyKey(scope);
    return ride;
  } catch (error) {
    if (isApiRequestError(error) && !error.retryable) clearIdempotencyKey(scope);
    throw error;
  }
}

/** Say no. Saying no twice, or too late, changes nothing on the server. */
export async function declineOffer(offerId: string): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/partner/rides/offers/{offer_id}/decline/", {
      params: { path: { offer_id: offerId } },
    }),
  );
}

export type SosAnswer = Schemas["Sos"];

function ridePath(rideId: string) {
  return { path: { ride_id: rideId } };
}

/** At the pickup. Refused with `not_at_pickup` until the last ping is within 200 m. */
export function markArrived(rideId: string): Promise<CaptainRide> {
  return request(() => getApiClient().POST("/api/v1/partner/rides/{ride_id}/arrived/", { params: ridePath(rideId) }));
}

/**
 * Start the trip with the rider's code. Each typed code gets its own idempotency key and keeps
 * it across network retries, so a timeout never costs a try; once the server answers, the key
 * goes, so typing the same code again is a new try.
 */
export async function startTrip(rideId: string, otp: string): Promise<CaptainRide> {
  const scope = `rides.start.${rideId}.${otp}`;
  try {
    const ride = await request(() =>
      getApiClient().POST("/api/v1/partner/rides/{ride_id}/start/", {
        body: { otp },
        params: { path: { ride_id: rideId }, header: { "Idempotency-Key": getStableIdempotencyKey(scope) } },
      }),
    );
    clearIdempotencyKey(scope);
    return ride;
  } catch (error) {
    if (isApiRequestError(error)) clearIdempotencyKey(scope);
    throw error;
  }
}

export function completeTrip(rideId: string): Promise<CaptainRide> {
  return request(() => getApiClient().POST("/api/v1/partner/rides/{ride_id}/complete/", { params: ridePath(rideId) }));
}

export function markPaymentReceived(rideId: string): Promise<CaptainRide> {
  return request(() =>
    getApiClient().POST("/api/v1/partner/rides/{ride_id}/payment-received/", { params: ridePath(rideId) }),
  );
}

export async function cancelAsCaptain(rideId: string, reason: string): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/partner/rides/{ride_id}/cancel/", { params: ridePath(rideId), body: { reason } }),
  );
}

export async function rateRider(rideId: string, stars: number): Promise<void> {
  await request(() =>
    getApiClient().POST("/api/v1/partner/rides/{ride_id}/rating/", { params: ridePath(rideId), body: { stars } }),
  );
}

/** SOS: the server uses the captain's last ping as the place. */
export function raiseCaptainSos(rideId: string): Promise<SosAnswer> {
  return request(() =>
    getApiClient().POST("/api/v1/partner/rides/{ride_id}/sos/", { params: ridePath(rideId), body: {} }),
  );
}
