"use client";

import { request } from "@vsolve/api-client";
import { m2QueryKeys } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

/**
 * Phase A: the Partner's own price book (contract 1.46.0).
 *
 * Two reads share one cache entry per service area — `PriceBookScreen` and, once
 * the composer wires it in, the "from my rate card" picker — so a rate saved on
 * one never goes stale on the other.
 */

export function usePriceBook(serviceAreaId?: string) {
  return useQuery({
    queryKey: m2QueryKeys.priceBook.list(serviceAreaId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/partner/price-book/", {
          params: { query: serviceAreaId ? { service_area_id: serviceAreaId } : {} },
        }),
      ),
  });
}

export function useSetPriceBookRate(serviceAreaId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workItemId,
      ratePaise,
      isActive,
    }: {
      workItemId: string;
      ratePaise: number;
      isActive: boolean;
    }) =>
      request(() =>
        getApiClient().PUT("/api/v1/partner/price-book/items/{work_item_id}/", {
          params: {
            path: { work_item_id: workItemId },
            query: serviceAreaId ? { service_area_id: serviceAreaId } : {},
          },
          body: { rate_paise: ratePaise, is_active: isActive },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: m2QueryKeys.priceBook.all });
    },
    retry: false,
  });
}
