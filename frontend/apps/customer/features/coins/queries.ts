"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export interface CustomerCoinsSummary {
  spendable_coins: number;
  promised_coins: number;
  locked_coins: number;
  pending_coins: number;
  next_pending_available_at: string | null;
  expiring_soon_coins: number;
  active_burn_policy?: {
    max_burn_percent: number;
    coin_value_paise: number;
  };
}

export interface CoinTransaction {
  id: string;
  kind: string;
  status: string;
  amount: number;
  notes?: string;
  created_at: string;
}

export interface CoinBurnPreviewResponse {
  applied_burn_coins: number;
  discount_paise: number;
  remaining_payable_paise: number;
}

export const coinsKeys = {
  summary: ["customer", "coins", "summary"] as const,
  transactions: ["customer", "coins", "transactions"] as const,
};

export function useCustomerCoins() {
  return useQuery({
    queryKey: coinsKeys.summary,
    queryFn: async (): Promise<CustomerCoinsSummary> => {
      const data = await request(() =>
        (getApiClient() as any).GET("/api/v1/customer/coins/"),
      );
      return data as unknown as CustomerCoinsSummary;
    },
    ...VOLATILE_STATE,
  });
}

export function useCoinTransactions() {
  return useQuery({
    queryKey: coinsKeys.transactions,
    queryFn: async (): Promise<CoinTransaction[]> => {
      const data = await request(() =>
        (getApiClient() as any).GET("/api/v1/customer/coins/transactions/"),
      );
      if (Array.isArray(data)) {
        return data as CoinTransaction[];
      }
      const page = data as unknown as { results?: CoinTransaction[] } | null;
      return page?.results ?? [];
    },
    ...VOLATILE_STATE,
  });
}

export function useCoinBurnPreview() {
  return useMutation({
    mutationFn: async (input: { order_payable_paise: number; requested_coins: number }): Promise<CoinBurnPreviewResponse> => {
      const data = await request(() =>
        (getApiClient() as any).POST("/api/v1/customer/coins/preview-burn/", {
          body: {
            order_payable_paise: input.order_payable_paise,
            requested_coins: input.requested_coins,
          },
        }),
      );
      return data as unknown as CoinBurnPreviewResponse;
    },
  });
}
