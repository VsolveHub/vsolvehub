import { useCompleteOrOpenCheckout } from "@vsolve/mobile-core";
import { Button, ErrorState, Text, cn, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";

import {
  buyPass,
  captainStatusKey,
  passesKey,
  useCaptainStatus,
  useEarnings,
  useMyPasses,
  usePassPlans,
  type CaptainPass,
  type EarningsPeriod,
  type PassPlan,
} from "../queries";

type Outcome = "active" | "submitted" | "preparing";

const OUTCOME_TEXT: Record<Outcome, string> = {
  active: "Your pass is active. You can go on duty.",
  submitted: "Payment sent. Your pass turns on as soon as Razorpay confirms it.",
  preparing: "The payment is still being prepared. Try again in a moment.",
};

const STATUS_TEXT: Record<string, string> = {
  PENDING_ACTIVATION: "Waiting for payment",
  QUEUED: "Starts when your current pass ends",
  ACTIVE: "Active",
  EXPIRED: "Ended",
  CANCELLED: "Cancelled",
};

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function hoursLabel(hours: number): string {
  return hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hours`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2 rounded-2xl bg-surface p-4">
      <Text className="text-xs font-semibold uppercase text-text-muted">{title}</Text>
      {children}
    </View>
  );
}

function EarningsCard() {
  const [period, setPeriod] = useState<EarningsPeriod>("today");
  const earnings = useEarnings(period);
  return (
    <Card title="Earnings">
      <View className="flex-row gap-2">
        {(["today", "week"] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === option }}
            onPress={() => setPeriod(option)}
            className={cn("rounded-full px-4 py-1.5", period === option ? "bg-[#00112e]" : "bg-surface-sunken")}
          >
            <Text className={cn("text-sm font-semibold", period === option ? "text-white" : "text-text")}>
              {option === "today" ? "Today" : "This week"}
            </Text>
          </Pressable>
        ))}
      </View>
      {earnings.isError ? (
        <Text className="text-sm text-danger">{"Couldn't load earnings. Pull to refresh."}</Text>
      ) : earnings.data ? (
        <>
          <Text className="text-3xl font-extrabold text-text">{formatMoney(earnings.data.earned_paise)}</Text>
          <Text className="text-sm text-text-muted">
            {earnings.data.rides} rides · {formatMoney(earnings.data.cash_collected_paise)} collected
          </Text>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </Card>
  );
}

function PassRow({ pass }: { pass: CaptainPass }) {
  return (
    <View className="flex-row justify-between gap-2 border-t border-line pt-2">
      <View className="flex-1">
        <Text className="text-sm font-semibold text-text">{pass.plan.name}</Text>
        <Text className="text-xs text-text-muted">
          {STATUS_TEXT[pass.status] ?? pass.status}
          {pass.starts_at ? ` · ${when(pass.starts_at)} to ${when(pass.ends_at)}` : ""}
        </Text>
      </View>
      <Text className="text-sm text-text">{pass.plan.price_paise === 0 ? "Free" : formatMoney(pass.plan.price_paise)}</Text>
    </View>
  );
}

/** The captain's Wallet: the pass that lets them drive, buying the next one, and earnings. */
export function CaptainWallet() {
  const status = useCaptainStatus();
  const plans = usePassPlans();
  const passes = useMyPasses();
  const queryClient = useQueryClient();
  const completeOrOpenCheckout = useCompleteOrOpenCheckout();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const buy = useMutation({
    mutationFn: async (plan: PassPlan): Promise<Outcome> => {
      const bought = await buyPass(plan.id);
      if (!bought.payment_attempt_id) return "active";
      const result = await completeOrOpenCheckout(String(bought.payment_attempt_id));
      return result.mode === "pending" ? "preparing" : "submitted";
    },
    onMutate: () => setOutcome(null),
    onSuccess: (result) => setOutcome(result),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: captainStatusKey });
      void queryClient.invalidateQueries({ queryKey: passesKey });
    },
  });

  if (status.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (status.isError) {
    return (
      <ErrorState
        title="We couldn't load your wallet"
        message={describeError(status.error).message}
        actionLabel="Try again"
        onAction={() => void status.refetch()}
      />
    );
  }

  const { active_pass: active, queued_pass: queued } = status.data;
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={
        <RefreshControl
          refreshing={status.isRefetching}
          onRefresh={() => {
            void status.refetch();
            void plans.refetch();
            void passes.refetch();
          }}
        />
      }
    >
      <Card title="Your pass">
        {active ? (
          <>
            <Text className="text-base font-bold text-text">{active.plan.name}</Text>
            <Text className="text-sm text-text">Ends {when(active.ends_at)}</Text>
          </>
        ) : (
          <Text className="text-sm text-text">No active pass. You need one to go on duty.</Text>
        )}
        {queued ? (
          <Text className="text-sm text-text-muted">Next: {queued.plan.name}, starts when this one ends</Text>
        ) : null}
      </Card>

      <Card title="Buy a pass">
        {active ? (
          <Text className="text-sm text-text-muted">You can buy your next pass when this one ends.</Text>
        ) : plans.isPending ? (
          <ActivityIndicator />
        ) : plans.isError ? (
          <Text className="text-sm text-danger">{"Couldn't load the passes. Pull to refresh."}</Text>
        ) : plans.data.length === 0 ? (
          <Text className="text-sm text-text-muted">No passes are on sale right now.</Text>
        ) : (
          plans.data.map((plan) => (
            <Button
              key={plan.id}
              block
              variant={plan.price_paise === 0 ? "outline" : "primary"}
              loading={buy.isPending && buy.variables?.id === plan.id}
              disabled={buy.isPending}
              onPress={() => buy.mutate(plan)}
            >
              {`${plan.name} · ${hoursLabel(plan.duration_hours)} · ${
                plan.price_paise === 0 ? "Free" : formatMoney(plan.price_paise)
              }`}
            </Button>
          ))
        )}
        {outcome ? <Text className="text-sm text-text">{OUTCOME_TEXT[outcome]}</Text> : null}
        {buy.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {describeError(buy.error, "mutation").message}
          </Text>
        ) : null}
      </Card>

      <EarningsCard />

      <Card title="Pass history">
        {passes.data && passes.data.length > 0 ? (
          passes.data.map((pass) => <PassRow key={pass.id} pass={pass} />)
        ) : passes.isError ? (
          <Text className="text-sm text-danger">{"Couldn't load your passes."}</Text>
        ) : passes.data ? (
          <Text className="text-sm text-text-muted">No passes yet.</Text>
        ) : (
          <ActivityIndicator />
        )}
      </Card>
    </ScrollView>
  );
}
