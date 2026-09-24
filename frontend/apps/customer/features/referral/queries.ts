"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export type CustomerReferralSummary = Schemas["CustomerReferralSummary"];
export type ReferralAttribution = Schemas["ReferralAttribution"];
export type ReferralValidateResponse = Schemas["ReferralValidateResponse"];

export const referralKeys = {
  summary: ["customer", "referral", "summary"] as const,
  attributions: ["customer", "referral", "attributions"] as const,
};

export function useCustomerReferral() {
  return useQuery({
    queryKey: referralKeys.summary,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/customer/referral/"),
      ),
    ...VOLATILE_STATE,
  });
}

export function useReferralAttributions() {
  return useQuery({
    queryKey: referralKeys.attributions,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/customer/referral/attributions/"),
      ),
    ...VOLATILE_STATE,
  });
}

export function useValidateReferralCode() {
  return useMutation({
    mutationFn: (code: string) =>
      request(() =>
        getApiClient().POST("/api/v1/customer/referral/validate/", {
          body: { code },
        }),
      ),
  });
}

export function useApplyReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) =>
      request(() =>
        getApiClient().POST("/api/v1/customer/referral/apply/", {
          body: { code },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: referralKeys.summary });
      void queryClient.invalidateQueries({ queryKey: referralKeys.attributions });
    },
  });
}
