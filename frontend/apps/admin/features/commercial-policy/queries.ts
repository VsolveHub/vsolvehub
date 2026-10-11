"use client";

import { request } from "@vsolve/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

import type { ActivateBody } from "./model";

const KEY = ["ops", "commercial-policies"] as const;

export function useCommercialPolicies() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const data = await request(() => getApiClient().GET("/api/v1/operations/commercial-policies/"));
      return Array.isArray(data) ? data : [];
    },
  });
}

export function useActivateCommercialPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ActivateBody) =>
      request(() => getApiClient().POST("/api/v1/operations/commercial-policies/activate/", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
    retry: false,
  });
}
