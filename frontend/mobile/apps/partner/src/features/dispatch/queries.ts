import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DispatchOfferData } from "@vsolve/mobile-core";

export type { DispatchOfferData };

export function fetchDispatchOffer(offerId: string): Promise<DispatchOfferData> {
  return request(() =>
    getApiClient().GET("/api/v1/partner/dispatch-offers/{offer_id}/", {
      params: { path: { offer_id: offerId } },
    }),
  ) as unknown as Promise<DispatchOfferData>;
}

export function acceptDispatchOffer(offerId: string): Promise<DispatchOfferData> {
  return request(() =>
    getApiClient().POST("/api/v1/partner/dispatch-offers/{offer_id}/accept/", {
      params: { path: { offer_id: offerId } },
    }),
  ) as unknown as Promise<DispatchOfferData>;
}

export function declineDispatchOffer(offerId: string): Promise<DispatchOfferData> {
  return request(() =>
    getApiClient().POST("/api/v1/partner/dispatch-offers/{offer_id}/decline/", {
      params: { path: { offer_id: offerId } },
    }),
  ) as unknown as Promise<DispatchOfferData>;
}

export function useDispatchOffer(offerId: string) {
  return useQuery<DispatchOfferData>({
    queryKey: ["partner", "dispatch-offers", offerId],
    queryFn: () => fetchDispatchOffer(offerId),
    enabled: Boolean(offerId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.status !== "PENDING" || data.remaining_seconds <= 0) return false;
      return 15000; // Background sync every 15s while pending
    },
  });
}

export function useAcceptDispatchOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => acceptDispatchOffer(offerId),
    onSuccess: (data, offerId) => {
      queryClient.setQueryData(["partner", "dispatch-offers", offerId], data);
      void queryClient.invalidateQueries({ queryKey: ["partner", "work"] });
      void queryClient.invalidateQueries({ queryKey: ["partner", "offers"] });
    },
  });
}

export function useDeclineDispatchOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => declineDispatchOffer(offerId),
    onSuccess: (data, offerId) => {
      queryClient.setQueryData(["partner", "dispatch-offers", offerId], data);
      void queryClient.invalidateQueries({ queryKey: ["partner", "offers"] });
    },
  });
}
