"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export interface WalletAccount {
  wallet_id: string;
  currency: string;
  balance_paise: number;
  available_balance_paise: number;
  reserved_paise: number;
  top_up_policy?: {
    min_top_up_paise: number;
    max_top_up_paise: number;
  };
}

export interface WalletTransaction {
  id: string;
  amount_paise: number;
  kind: string;
  status: string;
  idempotency_key?: string;
  notes?: string;
  created_at: string;
}

export interface WalletTopUpResponse {
  payment_attempt_id: string;
  purpose: string;
  amount_paise: number;
  currency: string;
  provider: string;
  provider_order_id: string;
  status: string;
}

export const walletKeys = {
  detail: ["customer", "wallet"] as const,
  transactions: ["customer", "wallet", "transactions"] as const,
};

export function useWallet() {
  return useQuery({
    queryKey: walletKeys.detail,
    queryFn: async (): Promise<WalletAccount> => {
      const data = await request(() =>
        (getApiClient() as any).GET("/api/v1/customer/wallet/"),
      );
      return data as unknown as WalletAccount;
    },
    ...VOLATILE_STATE,
  });
}

export function useWalletTransactions() {
  return useQuery({
    queryKey: walletKeys.transactions,
    queryFn: async () => {
      const data = await request(() =>
        (getApiClient() as any).GET("/api/v1/customer/wallet/transactions/"),
      );
      if (Array.isArray(data)) {
        return data;
      }
      const page = data as { results?: WalletTransaction[] } | null;
      return page?.results ?? [];
    },
    ...VOLATILE_STATE,
  });
}

export function useInitiateWalletTopUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { amount_paise: number }): Promise<WalletTopUpResponse> => {
      const idempotencyKey = `topup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      return request(() =>
        (getApiClient() as any).POST("/api/v1/customer/wallet/top-up/", {
          body: {
            amount_paise: input.amount_paise,
            idempotency_key: idempotencyKey,
          },
        }),
      ) as unknown as Promise<WalletTopUpResponse>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.detail });
      void queryClient.invalidateQueries({ queryKey: walletKeys.transactions });
    },
  });
}
