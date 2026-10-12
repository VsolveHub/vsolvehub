"use client";

import { usePagedList } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export type WalletAccount = Schemas["WalletAccount"];
export type WalletTransaction = Schemas["WalletTransaction"];
export type WalletTopUpResponse = Schemas["WalletTopUpResponse"];

export const walletKeys = {
  detail: ["customer", "wallet"] as const,
  transactions: ["customer", "wallet", "transactions"] as const,
};

export function useWallet() {
  return useQuery({
    queryKey: walletKeys.detail,
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/customer/wallet/"),
      ),
    ...VOLATILE_STATE,
  });
}

export function useWalletTransactions() {
  return usePagedList(walletKeys.transactions, (cursor) =>
    request(() =>
      getApiClient().GET("/api/v1/customer/wallet/transactions/", {
        params: { query: cursor ? { cursor } : {} },
      }),
    ),
  );
}

export function useInitiateWalletTopUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { amount_paise: number }) => {
      const idempotencyKey = `topup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      return request(() =>
        getApiClient().POST("/api/v1/customer/wallet/top-up/", {
          body: {
            amount_paise: input.amount_paise,
            idempotency_key: idempotencyKey,
          },
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.detail });
      void queryClient.invalidateQueries({ queryKey: walletKeys.transactions });
    },
  });
}
