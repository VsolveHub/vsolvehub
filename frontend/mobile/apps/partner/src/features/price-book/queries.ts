// Ported from frontend/apps/partner/features/price-book/queries.ts

import { request } from "@vsolve/api-client";
import { m2QueryKeys } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@vsolve/mobile-core";

/**
 * Phase A: the Partner's own price book (contract 1.46.0).
 *
 * Two reads share one cache entry per service area — `PriceBookScreen` and, once
 * the composer wires it in, the "from my rate card" picker — so a rate saved on
 * one never goes stale on the other.
 */

/**
 * @param skill Narrow to one trade — the enquiry's `pricing_skill_code` — so the
 *   composer never mixes a plumber's and an electrician's catalogue on one
 *   estimate. Omitted on the rate-card screen, which lists every trade.
 */
export function usePriceBook(serviceAreaId?: string, skill?: string) {
  return useQuery({
    queryKey: m2QueryKeys.priceBook.list(serviceAreaId, skill),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/partner/price-book/", {
          params: {
            query: {
              ...(serviceAreaId ? { service_area_id: serviceAreaId } : {}),
              ...(skill ? { skill } : {}),
            },
          },
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
