"use client";

import { usePagedList } from "@vsolve/query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export type CustomerCoinsSummary = Schemas["CustomerCoinsSummary"];
export type CoinTransaction = Schemas["CoinTransaction"];
export type CoinBurnPreviewResponse = Schemas["CoinBurnPreviewResponse"];

export const coinsKeys = {
  summary: ["customer", "coins", "summary"] as const,
  transactions: ["customer", "coins", "transactions"] as const,
};

export function useCustomerCoins() {
  return useQuery({
    queryKey: coinsKeys.summary,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/customer/coins/"),
      ),
    ...VOLATILE_STATE,
  });
}

export function useCoinTransactions() {
  return usePagedList(coinsKeys.transactions, (cursor) =>
    request(() =>
      getApiClient().GET("/api/v1/customer/coins/transactions/", {
        params: { query: cursor ? { cursor } : {} },
      }),
    ),
  );
}

export function useCoinBurnPreview() {
  return useMutation({
    mutationFn: (input: { order_payable_paise: number; requested_coins: number }) =>
      request(() =>
        getApiClient().POST("/api/v1/customer/coins/preview-burn/", {
          body: {
            order_payable_paise: input.order_payable_paise,
            requested_coins: input.requested_coins,
          },
        }),
      ),
  });
}
