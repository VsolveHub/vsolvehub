// Ported from frontend/apps/customer/features/payment/view/checkout-loyalty-options.tsx
import { useQuery } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { Badge, formatMoney, Text } from "@vsolve/mobile-ui";
import { Coins, Wallet } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Switch, View } from "react-native";

import { useCustomerCoins, useWallet } from "@/features/account/queries";

export function loyaltyPaymentAmounts(input: {
  payablePaise: number;
  availablePaise: number;
  useWallet: boolean;
  discountPaise: number;
  appliedCoins: number;
  useCoins: boolean;
}): { walletAmountPaise: number; coinBurnAmount: number } {
  const discount = input.useCoins ? input.discountPaise : 0;
  const afterCoins = Math.max(0, input.payablePaise - discount);
  return {
    walletAmountPaise: input.useWallet ? Math.min(input.availablePaise, afterCoins) : 0,
    coinBurnAmount: input.useCoins ? input.appliedCoins : 0,
  };
}

export function useCheckoutLoyalty(payablePaise: number) {
  const [applyWallet, setApplyWallet] = useState(false);
  const [applyCoins, setApplyCoins] = useState(false);
  const walletQuery = useWallet();
  const coinsQuery = useCustomerCoins();
  const available = walletQuery.data?.available_balance_paise ?? 0;
  const spendable = coinsQuery.data?.spendable_coins ?? 0;

  const preview = useQuery({
    queryKey: ["customer", "coins", "preview-burn", payablePaise, spendable],
    enabled: applyCoins && payablePaise > 0 && spendable > 0,
    queryFn: async () => {
      const data = await request(() =>
        getApiClient().POST("/api/v1/customer/coins/preview-burn/", {
          body: {
            order_payable_paise: payablePaise,
            requested_coins: spendable,
          },
        }),
      );
      return data as
        | { discount_paise?: number; applied_burn_coins?: number; max_burn_paise?: number }
        | undefined;
    },
  });

  const discountPaise = applyCoins ? (preview.data?.discount_paise ?? 0) : 0;
  const appliedCoins = applyCoins ? (preview.data?.applied_burn_coins ?? 0) : 0;
  const amounts = loyaltyPaymentAmounts({
    payablePaise,
    availablePaise: available,
    useWallet: applyWallet,
    discountPaise,
    appliedCoins,
    useCoins: applyCoins,
  });

  return {
    payablePaise,
    available,
    spendable,
    useWallet: applyWallet,
    setUseWallet: setApplyWallet,
    useCoins: applyCoins,
    setUseCoins: setApplyCoins,
    discountPaise,
    maxBurnPaise: preview.data?.max_burn_paise ?? null,
    walletPaise: amounts.walletAmountPaise,
    gatewayPaise: Math.max(0, payablePaise - discountPaise - amounts.walletAmountPaise),
    walletAmountPaise: amounts.walletAmountPaise,
    coinBurnAmount: amounts.coinBurnAmount,
    show: available > 0 || spendable > 0,
  };
}

export interface CheckoutLoyaltyOptionsProps {
  loyalty: ReturnType<typeof useCheckoutLoyalty>;
}

/**
 * Opt-in wallet and coin burn. Amounts come from the server preview.
 * Toggles start off so a balance is saved unless the customer chooses it.
 */
export function CheckoutLoyaltyOptions({ loyalty }: CheckoutLoyaltyOptionsProps) {
  if (!loyalty.show) {
    return null;
  }

  const {
    available,
    spendable,
    useWallet,
    setUseWallet,
    useCoins,
    setUseCoins,
    discountPaise,
    maxBurnPaise,
    walletPaise,
    gatewayPaise,
  } = loyalty;

  return (
    <View className="mt-4 rounded-xl border border-line bg-surface-sunken p-4">
      <View className="flex-row items-center justify-between border-b border-line pb-2">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-navy-900">
          Wallet and coins
        </Text>
        <Badge tone="neutral">Optional</Badge>
      </View>

      <View className="mt-3 gap-3">
        {available > 0 ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: useWallet }}
            accessibilityLabel="Use wallet"
            onPress={() => setUseWallet(!useWallet)}
            className="flex-row items-center justify-between gap-3 active:opacity-80"
          >
            <View className="flex-1 flex-row items-center gap-2">
              <View className="h-7 w-7 items-center justify-center rounded-lg bg-orange-100/70">
                <Wallet size={14} color="#EA580C" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-navy-900">Use wallet</Text>
                <Text className="text-xs text-text-secondary">
                  Available {formatMoney(available)}
                </Text>
              </View>
            </View>
            <Switch
              value={useWallet}
              onValueChange={setUseWallet}
              trackColor={{ true: "#EA580C", false: "#E2E8F0" }}
              accessibilityRole="switch"
              accessibilityLabel="Use wallet"
            />
          </Pressable>
        ) : null}

        {spendable > 0 ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: useCoins }}
            accessibilityLabel="Use V Coins"
            onPress={() => setUseCoins(!useCoins)}
            className="flex-row items-center justify-between gap-3 active:opacity-80"
          >
            <View className="flex-1 flex-row items-center gap-2">
              <View className="h-7 w-7 items-center justify-center rounded-lg bg-amber-100/70">
                <Coins size={14} color="#D97706" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-navy-900">Use V Coins</Text>
                <Text className="text-xs text-text-secondary">
                  {spendable} spendable
                  {maxBurnPaise !== null ? ` · max ${formatMoney(maxBurnPaise)}` : ""}
                </Text>
              </View>
            </View>
            <Switch
              value={useCoins}
              onValueChange={setUseCoins}
              trackColor={{ true: "#EA580C", false: "#E2E8F0" }}
              accessibilityRole="switch"
              accessibilityLabel="Use V Coins"
            />
          </Pressable>
        ) : null}
      </View>

      {useWallet || useCoins ? (
        <View className="mt-3 border-t border-line pt-2 gap-1 text-xs">
          {useCoins ? (
            <View className="flex-row justify-between">
              <Text className="text-xs text-text-secondary">Coin discount</Text>
              <Text className="text-xs tabular-nums text-success-text">
                -{formatMoney(discountPaise)}
              </Text>
            </View>
          ) : null}
          {useWallet ? (
            <View className="flex-row justify-between">
              <Text className="text-xs text-text-secondary">Wallet</Text>
              <Text className="text-xs tabular-nums text-text-secondary">
                -{formatMoney(walletPaise)}
              </Text>
            </View>
          ) : null}
          <View className="flex-row justify-between pt-1">
            <Text className="text-xs font-semibold text-navy-900">Left to pay</Text>
            <Text className="text-xs font-semibold tabular-nums text-navy-900">
              {formatMoney(gatewayPaise)}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

