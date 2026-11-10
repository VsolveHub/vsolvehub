import { request, type Schemas } from "@vsolve/api-client";
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
