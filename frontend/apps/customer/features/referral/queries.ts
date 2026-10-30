"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export interface ReferralTier {
  min_qualified_referrals?: number;
  referrer_wallet_paise?: number;
  referrer_coins_amount?: number;
}

export interface CustomerReferralSummary {
  code: string;
  referral_code?: string;
  share_url: string;
  share_message: string;
  total_earned_paise: number;
  total_earned_coins: number;
  invited_count: number;
  successful_referral_count: number;
  pending_referral_count: number;
  current_tier_min: number | null;
  next_tier_min: number | null;
  referrals_to_next_tier: number | null;
  active_program?: {
    name?: string;
    description?: string;
    referee_wallet_paise?: number;
    referee_coins_amount?: number;
    tiers?: ReferralTier[];
  };
}

export interface ReferralAttribution {
  id: string;
  referred_user_name?: string;
  referee_display?: string;
  status: string;
  reward_coins?: number;
  reward_paise?: number;
  reward_available_at?: string;
  attributed_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ReferralValidateResponse {
  valid: boolean;
  message?: string;
  referrer_name?: string;
}

export const referralKeys = {
  summary: ["customer", "referral", "summary"] as const,
  attributions: ["customer", "referral", "attributions"] as const,
};

export function useCustomerReferral() {
  return useQuery({
    queryKey: referralKeys.summary,
    queryFn: async (): Promise<CustomerReferralSummary> => {
      const data = await request(() =>
        (getApiClient() as any).GET("/api/v1/customer/referral/"),
      );
      return data as unknown as CustomerReferralSummary;
    },
    ...VOLATILE_STATE,
  });
}

export function useReferralAttributions() {
  return useQuery({
    queryKey: referralKeys.attributions,
    queryFn: async (): Promise<ReferralAttribution[]> => {
      const data = await request(() =>
        (getApiClient() as any).GET("/api/v1/customer/referral/attributions/"),
      );
      if (Array.isArray(data)) {
        return data as ReferralAttribution[];
      }
      const page = data as unknown as { results?: ReferralAttribution[] } | null;
      return page?.results ?? [];
    },
    ...VOLATILE_STATE,
  });
}

export function useValidateReferralCode() {
  return useMutation({
    mutationFn: async (code: string): Promise<ReferralValidateResponse> => {
      const data = await request(() =>
        (getApiClient() as any).POST("/api/v1/customer/referral/validate/", {
          body: { code },
        }),
      );
      return data as unknown as ReferralValidateResponse;
    },
  });
}
