import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import type { Page } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export type OpsRideRow = Schemas["OpsRideRow"];
export type OpsRideDetail = Schemas["OpsRideDetail"];
export type OpsCaptain = Schemas["OpsCaptain"];
export type OpsSos = Schemas["OpsSos"];

/** How often the live lists ask again: an SOS must show within 10 s (brief §7.3, scenario 25). */
export const LIVE_REFRESH_MS = 10_000;

export const ridesKey = ["ops", "rides"] as const;
export const sosKey = ["ops", "rides", "sos"] as const;

export function rideDetailKey(rideId: string) {
  return ["ops", "rides", "detail", rideId] as const;
}

export function fetchRidesPage(states: string, cursor?: string): Promise<Page<OpsRideRow>> {
  return request(() =>
    getApiClient().GET("/api/v1/operations/rides/", { params: { query: { state: states, cursor } } }),
  );
}

export function fetchCaptainsPage(cursor?: string): Promise<Page<OpsCaptain>> {
  return request(() => getApiClient().GET("/api/v1/operations/rides/captains/", { params: { query: { cursor } } }));
}

export function fetchSosPage(status: string, cursor?: string): Promise<Page<OpsSos>> {
  return request(() =>
    getApiClient().GET("/api/v1/operations/rides/sos/", { params: { query: { status, cursor } } }),
  );
}

export function useOpsRide(rideId: string) {
  return useQuery({
    queryKey: rideDetailKey(rideId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/rides/{ride_id}/", { params: { path: { ride_id: rideId } } }),
      ),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useForceCancel(rideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/rides/{ride_id}/cancel/", {
          params: { path: { ride_id: rideId } },
          body: { reason },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ridesKey }),
  });
}

export function useResolveSos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sosId, note }: { sosId: string; note: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/rides/sos/{sos_id}/resolve/", {
          params: { path: { sos_id: sosId } },
          body: { resolution_note: note },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sosKey }),
  });
}
