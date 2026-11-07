// Ported from frontend/apps/customer/features/addresses/queries.ts
import { request, type Schemas } from "@vsolve/api-client";
import { useMutation, useQuery } from "@tanstack/react-query";

import { getApiClient } from "../api/client";

export type PlaceSuggestion = Schemas["PlaceSuggestion"];
export type ResolvedLocation = Schemas["ReverseGeocodeResponse"];
export type ReverseGeocodeRequest = Schemas["ReverseGeocodeRequestRequest"];

/**
 * Turns a coordinate pair into address text.
 */
export function useReverseGeocode() {
  return useMutation({
    mutationFn: (input: ReverseGeocodeRequest) =>
      request(() => getApiClient().POST("/api/v1/geocoding/reverse/", { body: input })),
    retry: false,
  });
}

/**
 * Places matching what the person typed, for picking a pin.
 */
export function usePlaceSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["geocoding", "search", q.toLowerCase()],
    queryFn: () =>
      request(() => getApiClient().GET("/api/v1/geocoding/search/", { params: { query: { q } } })),
    enabled: q.length >= 3,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
