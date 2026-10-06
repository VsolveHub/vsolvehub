"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { Button, Card, ErrorState, Field, Input, Spinner } from "@vsolve/ui";
import { useEffect, useState } from "react";

import { getApiClient } from "@/lib/api/browser";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

import { RewardRulesCard } from "./reward-rules-card";

export function LoyaltyBoard() {
  const queryClient = useQueryClient();
  const burn = useQuery({
    queryKey: ["ops", "burn-policies"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/ops/loyalty/burn-policies/")),
  });
  const policies = useQuery({
    queryKey: ["ops", "wallet-policies"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/ops/wallet/policies/")),
  });
  const liability = useQuery({
    queryKey: ["ops", "wallet-liability"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/ops/wallet/liability/")),
  });

  const [maxPercent, setMaxPercent] = useState("");
  const [coinValue, setCoinValue] = useState("");
  const [minPaise, setMinPaise] = useState("");
  const [maxPaise, setMaxPaise] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !burn.data || !policies.data) return;
    const burnPolicy = burn.data.find((policy) => policy.is_active) ?? burn.data[0];
    const walletPolicy = policies.data.find((policy) => policy.is_active) ?? policies.data[0];
    if (burnPolicy) {
      setMaxPercent(burnPolicy.max_burn_percent == null ? "" : String(burnPolicy.max_burn_percent));
      setCoinValue(burnPolicy.coin_value_paise == null ? "" : String(burnPolicy.coin_value_paise));
    }
    if (walletPolicy) {
      setMinPaise(walletPolicy.min_paise == null ? "" : String(walletPolicy.min_paise));
      setMaxPaise(walletPolicy.max_paise == null ? "" : String(walletPolicy.max_paise));
    }
    setSeeded(true);
  }, [burn.data, policies.data, seeded]);

  const publishBurn = useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/ops/loyalty/burn-policies/", {
          body: {
            max_burn_percent: Number(maxPercent),
            coin_value_paise: Number(coinValue),
          },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ops", "burn-policies"] });
    },
  });
  const publishWallet = useMutation({
    mutationFn: () =>
      request(() =>
        getApiClient().POST("/api/v1/ops/wallet/policies/", {
          body: { min_paise: Number(minPaise), max_paise: Number(maxPaise) },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ops", "wallet-policies"] });
    },
  });
  if (burn.isPending || policies.isPending) {
    return <Spinner />;
  }
  if (burn.isError || policies.isError) {
    return (
      <ErrorState
        severity="warning"
        title="Loyalty settings could not be loaded"
        message="Operations access is required to read wallet and coin configuration."
      />
    );
  }

  return (
    <div className="mt-6 grid gap-4">
      <Card padding="md">
        <h2 className="text-sm font-semibold">Wallet liability</h2>
        <p className="mt-1 text-sm">
          {liability.isError
            ? "Liability total is unavailable for this sign-in."
            : `${liability.data?.total_liability_paise ?? 0} paise across ${liability.data?.active_wallets_count ?? 0} wallets`}
        </p>
        <a
          className="mt-3 inline-flex text-sm font-semibold text-text-link"
          href={`${PUBLIC_API_BASE_URL}/api/v1/ops/wallet/liability.xlsx`}
        >
          Download Excel
        </a>
      </Card>

      <Card padding="md">
        <h2 className="text-sm font-semibold">V Coins at checkout</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Max % of an order customers can pay with coins, and what one coin is worth (10 paise =
          100 coins for ₹10).
        </p>
        <ul className="mt-2 text-sm">
          {(burn.data ?? []).map((policy) => (
            <li key={policy.id}>
              {policy.max_burn_percent}% · {policy.coin_value_paise} paise/coin
              {policy.is_active ? " · active" : ""}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Field label="Max % of an order">
            <Input value={maxPercent} onChange={(event) => setMaxPercent(event.target.value)} />
          </Field>
          <Field label="Coin value (paise per coin)">
            <Input value={coinValue} onChange={(event) => setCoinValue(event.target.value)} />
          </Field>
          <Button
            loading={publishBurn.isPending}
            disabled={
              maxPercent.trim() === "" ||
              coinValue.trim() === "" ||
              !Number.isInteger(Number(maxPercent)) ||
              !Number.isInteger(Number(coinValue))
            }
            onClick={() => publishBurn.mutate()}
          >
            Save coin policy
          </Button>
        </div>
      </Card>

      <Card padding="md">
        <h2 className="text-sm font-semibold">Wallet top-up limits</h2>
        <ul className="mt-2 text-sm">
          {(policies.data ?? []).map((policy) => (
            <li key={policy.id}>
              {policy.min_paise}–{policy.max_paise} paise{policy.is_active ? " · active" : ""}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Field label="Minimum paise">
            <Input value={minPaise} onChange={(event) => setMinPaise(event.target.value)} />
          </Field>
          <Field label="Maximum paise">
            <Input value={maxPaise} onChange={(event) => setMaxPaise(event.target.value)} />
          </Field>
          <Button
            loading={publishWallet.isPending}
            disabled={
              minPaise.trim() === "" ||
              maxPaise.trim() === "" ||
              !Number.isInteger(Number(minPaise)) ||
              !Number.isInteger(Number(maxPaise))
            }
            onClick={() => publishWallet.mutate()}
          >
            Publish top-up policy
          </Button>
        </div>
      </Card>

      <RewardRulesCard />
    </div>
  );
}
