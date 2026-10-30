"use client";

import { useQuery } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { Badge, formatMoney } from "@vsolve/ui";
import { Coins, Wallet } from "lucide-react";
import { useState } from "react";

import { useCustomerCoins } from "@/features/coins/queries";
import { useWallet } from "@/features/wallet/queries";
import { getApiClient } from "@/lib/api/browser";

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
        (getApiClient() as any).POST("/api/v1/customer/coins/preview-burn/", {
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

interface CheckoutLoyaltyOptionsProps {
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
    <div className="mt-4 rounded-xl border border-[#e7e2da] bg-[#FAF9F7] p-4 text-xs space-y-3">
      <div className="flex items-center justify-between border-b border-[#eee9e0] pb-2">
        <span className="font-bold text-navy-900 uppercase tracking-wider text-[11px]">
          Wallet and coins
        </span>
        <Badge tone="neutral" className="text-[10px] py-0">
          Optional
        </Badge>
      </div>

      {available > 0 ? (
        <label className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-orange-100/70 text-[#EA580C]">
              <Wallet className="size-3.5" />
            </span>
            <span>
              <span className="font-semibold text-navy-900 block">Use wallet</span>
              <span className="text-[11px] text-text-secondary">
                Available {formatMoney(available)}
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={useWallet}
            onChange={(event) => setUseWallet(event.target.checked)}
          />
        </label>
      ) : null}

      {spendable > 0 ? (
        <label className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-amber-100/70 text-amber-600">
              <Coins className="size-3.5" />
            </span>
            <span>
              <span className="font-semibold text-navy-900 block">Use V Coins</span>
              <span className="text-[11px] text-text-secondary">
                {spendable} spendable
                {maxBurnPaise !== null ? ` · max ${formatMoney(maxBurnPaise)}` : ""}
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={useCoins}
            onChange={(event) => setUseCoins(event.target.checked)}
          />
        </label>
      ) : null}

      <dl className="space-y-1 border-t border-[#eee9e0] pt-2 text-[11px]">
        <div className="flex justify-between">
          <dt>Coin discount</dt>
          <dd data-numeric>{formatMoney(discountPaise)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Wallet</dt>
          <dd data-numeric>{formatMoney(walletPaise)}</dd>
        </div>
        <div className="flex justify-between font-semibold text-navy-900">
          <dt>Left to pay</dt>
          <dd data-numeric>{formatMoney(gatewayPaise)}</dd>
        </div>
      </dl>
    </div>
  );
}

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
