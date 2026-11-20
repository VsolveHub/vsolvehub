"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE, queryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

export type OperationsAreaRequestGroup = Schemas["OperationsAreaRequestGroup"];
export type OperationsAreaRequestTradeCount = Schemas["OperationsAreaRequestTradeCount"];

export interface AreaRequestFilters {
  status?: string;
  trade?: string;
  search?: string;
}

export function useAreaRequests(filters: AreaRequestFilters = {}) {
  return useQuery({
    queryKey: queryKeys.operations.areaRequests(filters),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/area-requests/", {
          params: {
            query: {
              ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
              ...(filters.trade && filters.trade !== "ALL" ? { trade: filters.trade } : {}),
              ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
            },
          },
        }),
      ),
    ...VOLATILE_STATE,
  });
}

export function useNotifyAreaRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postalCode: string) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/area-requests/{postal_code}/notify/", {
          params: { path: { postal_code: postalCode } },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}

export function useDismissAreaRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      postalCode,
      reason,
      applicationId,
    }: {
      postalCode: string;
      reason?: string;
      /** Only this application's request (review screen); omit to dismiss everyone's. */
      applicationId?: string;
    }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/area-requests/{postal_code}/dismiss/", {
          params: { path: { postal_code: postalCode } },
          body: {
            postal_code: postalCode,
            reason: reason || "",
            ...(applicationId ? { application_id: applicationId } : {}),
          },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.operations.all });
    },
  });
}
