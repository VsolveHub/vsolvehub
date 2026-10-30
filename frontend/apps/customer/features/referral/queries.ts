"use client";

import { usePagedList } from "@vsolve/query";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  return usePagedList(referralKeys.attributions, (cursor) =>
    request(() =>
      getApiClient().GET("/api/v1/customer/referral/attributions/", {
        params: { query: cursor ? { cursor } : {} },
      }),
    ),
  );
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
