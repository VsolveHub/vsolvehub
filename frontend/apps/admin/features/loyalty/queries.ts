"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export type CoinGrantRule = Schemas["CoinGrantRule"];
export type CoinGrantRuleRequest = Schemas["CoinGrantRuleRequest"];
export type CoinEarnTierRequest = Schemas["CoinEarnTierRequest"];
export type CoinEarnTier = Schemas["CoinEarnTier"];
export type OpsReferralAttribution = Schemas["OpsReferralAttribution"];
export type ReferralAttributionStatus = NonNullable<OpsReferralAttribution["status"]>;
export type ReferralProgramVersion = Schemas["ReferralProgramVersion"];
export type ReferralProgramWrite = Schemas["ReferralProgramWriteRequest"];
export type LoyaltySettings = Schemas["LoyaltySettings"];
export type OpsCustomerLedger = Schemas["OpsCustomerLedger"];

export const loyaltyKeys = {
  settings: ["ops", "loyalty-settings"] as const,
  rules: ["ops", "coin-grant-rules"] as const,
  programs: ["ops", "referral-programs"] as const,
  attributions: (status: string, phone: string) =>
    ["ops", "referral-attributions", status, phone] as const,
  ledger: (phone: string) => ["ops", "customer-ledger", phone] as const,
};

export function useLoyaltySettings() {
  return useQuery({
    queryKey: loyaltyKeys.settings,
    queryFn: () => request(() => getApiClient().GET("/api/v1/ops/loyalty/settings/")),
  });
}

export function useSaveLoyaltySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { reward_hold_days: number; referral_monthly_cap: number }) =>
      request(() => getApiClient().PATCH("/api/v1/ops/loyalty/settings/", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: loyaltyKeys.settings }),
  });
}

export function useCoinGrantRules() {
  return useQuery({
    queryKey: loyaltyKeys.rules,
    queryFn: () => request(() => getApiClient().GET("/api/v1/ops/loyalty/grant-rules/")),
  });
}

export function useCreateCoinGrantRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CoinGrantRuleRequest) =>
      request(() => getApiClient().POST("/api/v1/ops/loyalty/grant-rules/", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: loyaltyKeys.rules }),
  });
}

export function useSetCoinGrantRuleActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      request(() =>
        getApiClient().PATCH("/api/v1/ops/loyalty/grant-rules/{rule_id}/", {
          params: { path: { rule_id: id } },
          body: { is_active: isActive },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: loyaltyKeys.rules }),
  });
}

export function useReferralPrograms() {
  return useQuery({
    queryKey: loyaltyKeys.programs,
    queryFn: () => request(() => getApiClient().GET("/api/v1/ops/referral/programs/")),
  });
}

export function usePublishReferralProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReferralProgramWrite) =>
      request(() => getApiClient().POST("/api/v1/ops/referral/programs/", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: loyaltyKeys.programs }),
  });
}

export function useReferralAttributions(status: string, phone: string) {
  return useQuery({
    queryKey: loyaltyKeys.attributions(status, phone),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/ops/referral/attributions/", {
          params: {
            query: {
              ...(status ? { status } : {}),
              ...(phone ? { phone } : {}),
            },
          },
        }),
      ),
  });
}

export function useReviewReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: "reject" | "reverse";
      reason: string;
    }) =>
      request(() =>
        action === "reject"
          ? getApiClient().POST("/api/v1/ops/referral/attributions/{attribution_id}/reject/", {
              params: { path: { attribution_id: id } },
              body: { reason },
            })
          : getApiClient().POST("/api/v1/ops/referral/attributions/{attribution_id}/reverse/", {
              params: { path: { attribution_id: id } },
              body: { reason },
            }),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["ops", "referral-attributions"] }),
  });
}

export function useCustomerLedger(phone: string) {
  return useQuery({
    queryKey: loyaltyKeys.ledger(phone),
    enabled: phone.length > 0,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/ops/loyalty/customer-ledger/", {
          params: { query: { phone_number: phone } },
        }),
      ),
  });
}

export function useAdjustCoins() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { customer_id: string; amount: number; reason: string }) =>
      request(() => getApiClient().POST("/api/v1/ops/loyalty/coin-adjustments/", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ops", "customer-ledger"] }),
  });
}

/** "₹1,234" from integer paise. Display only; the server owns every amount. */
export function rupees(paise: number | null | undefined): string {
  return `₹${((paise ?? 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Whole, non-negative integer from a text input, or null. */
export function wholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
