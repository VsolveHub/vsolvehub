// Ported from frontend/apps/partner/features/earnings/view/earnings-panel.tsx
import { Badge, Button, Card, ErrorState, Spinner, Text, cn, formatMoney } from "@vsolve/mobile-ui";
import { ScrollView, View } from "react-native";

import { Pictogram, type PictogramName } from "@/features/work-stack/view/pictogram";
import { EarningsChart, toDailyEarnings } from "./earnings-chart";
import {
  usePartnerBalance,
  usePartnerLedger,
  usePartnerPayoutAccount,
  usePartnerPerformance,
} from "../queries";

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning"> = {
  PENDING: "warning",
  AVAILABLE: "info",
  RESERVED: "info",
  PAID: "success",
  RELEASED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "ON HOLD",
  AVAILABLE: "READY",
  RESERVED: "IN NEXT RUN",
  PAID: "PAID",
  RELEASED: "RELEASED",
};

const BALANCE_TONE = {
  info: "border-info-line bg-info-surface text-info-text",
  warning: "border-warning-line bg-warning-surface text-warning-text",
  success: "border-success-line bg-success-surface text-success-text",
} as const;

function BalanceTile({
  label,
  amountPaise,
  tone,
  icon,
}: {
  label: string;
  amountPaise: number;
  tone: keyof typeof BALANCE_TONE;
  icon: PictogramName;
}) {
  return (
    <View className={cn("w-[48%] rounded-plate border p-2.5 sm:p-3", BALANCE_TONE[tone])}>
      <View className="flex-row items-center gap-1">
        <Pictogram name={icon} size="xs" />
        <Text numberOfLines={1} className={cn("text-[0.625rem] font-semibold uppercase tracking-wide", BALANCE_TONE[tone])}>
          {label}
        </Text>
      </View>
      <Text numberOfLines={1} className={cn("mt-1 text-base font-bold sm:text-lg", BALANCE_TONE[tone])}>
        {formatMoney(amountPaise)}
      </Text>
    </View>
  );
}

export function EarningsPanel() {
  const balance = usePartnerBalance();
  const ledger = usePartnerLedger();
  const account = usePartnerPayoutAccount();
  const performance = usePartnerPerformance();

  if (balance.isPending) {
    return (
      <Card className="m-4 flex-row items-center gap-2 p-6">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading your earnings…</Text>
      </Card>
    );
  }
  if (balance.isError || !balance.data) {
    return (
      <ErrorState
        title="We could not load your earnings"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void balance.refetch()}
      />
    );
  }

  const data = balance.data;
  const entries = ledger.data?.pages.flatMap((page) => page.results) ?? [];
  const vsolveOutstanding = data.available_paise + data.reserved_paise + data.pending_paise;
  const monthDirect = performance.data?.month_direct_paise ?? 0;

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-5 px-4 py-5">
      {/* Warning banner */}
      {data.pending_paise > 0 ? (
        <View className="flex-row gap-3 rounded-card border border-warning-line bg-warning-surface p-4">
          <Pictogram name="later" size="sm" className="mt-0.5 shrink-0 text-warning-text" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-warning-text">Some of your earnings are on hold</Text>
            <Text className="mt-0.5 text-sm text-warning-text/80">Review the required documentation to release funds.</Text>
          </View>
        </View>
      ) : null}

      {/* Total earned this month */}
      <Card className="p-5">
        <Text className="text-sm font-semibold text-text-secondary">Total earned this month</Text>
        {performance.isPending ? (
          <View className="mt-3 flex-row items-center gap-2">
            <Spinner size="sm" />
            <Text className="text-sm text-text-secondary">Loading this month…</Text>
          </View>
        ) : performance.isError || !performance.data ? (
          <Text className="mt-2 text-sm text-text-secondary">This total is temporarily unavailable.</Text>
        ) : (
          <>
            <Text className="mt-1 text-4xl font-bold leading-tight text-text">
              {formatMoney(performance.data.month_net_paise)}
            </Text>
            <Text className="mt-2 text-sm text-text-secondary">
              {monthDirect > 0
                ? `${formatMoney(monthDirect)} was paid directly by customers.`
                : "Includes direct customer payments and work paid through Vsolve."}
            </Text>
          </>
        )}
      </Card>

      {/* Vsolve payout balance */}
      <Card className="p-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-text-secondary">Vsolve payout balance</Text>
            <Text className="mt-1 text-xs leading-5 text-text-secondary">
              Money Vsolve collected and still has to pay you.
            </Text>
          </View>
          <Text className="shrink-0 text-2xl font-bold text-text">
            {formatMoney(vsolveOutstanding)}
          </Text>
        </View>

        {vsolveOutstanding === 0 && monthDirect > 0 ? (
          <Text className="mt-3 rounded-plate bg-info-surface px-3 py-2 text-xs leading-5 text-info-text">
            Nothing is due from Vsolve because this month’s {formatMoney(monthDirect)} was paid directly by customers.
          </Text>
        ) : null}

        <View className="mt-4 flex-row flex-wrap gap-2">
          <BalanceTile label="Ready" amountPaise={data.available_paise} tone="info" icon="money" />
          <BalanceTile label="Next run" amountPaise={data.reserved_paise} tone="info" icon="held" />
          <BalanceTile label="On hold" amountPaise={data.pending_paise} tone="warning" icon="later" />
          <BalanceTile label="Paid" amountPaise={data.paid_paise} tone="success" icon="done" />
        </View>
      </Card>

      {/* How you are doing */}
      <Card className="p-5">
        <Text className="text-base font-bold text-text">How you are doing</Text>
        <View className="mt-3">
          {performance.isError ? (
            <View className="rounded-card border border-line bg-surface-sunken p-4">
              <Text className="text-sm text-text-secondary">
                We could not load your last 7 days just now. Your balance above is still correct.
              </Text>
            </View>
          ) : performance.isPending || !performance.data ? (
            <View className="flex-row items-center gap-2 p-4">
              <Spinner size="sm" />
              <Text className="text-sm text-text-secondary">Loading your last 7 days…</Text>
            </View>
          ) : (
            <EarningsChart days={toDailyEarnings(performance.data.daily)} />
          )}
        </View>
      </Card>

      {/* Payout method */}
      <Card className="flex-row items-center gap-3 p-4">
        <View className="size-10 shrink-0 items-center justify-center rounded-lg bg-info-surface">
          <Pictogram name="money" size="sm" className="text-info-text" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-text">Payout Method</Text>
          {account.data ? (
            <Text className="text-sm text-text-secondary">
              Paying into ••••{account.data.account_last4}
              {account.data.is_payable_now
                ? ""
                : ` — not usable until ${new Date(account.data.effective_from).toLocaleDateString("en-IN")}`}
            </Text>
          ) : (
            <Text className="text-sm text-text-secondary">No payout account yet.</Text>
          )}
        </View>
      </Card>

      {/* Recent Activity */}
      <View className="gap-2">
        <Text className="text-base font-bold text-text">Recent Activity</Text>
        {ledger.isPending ? (
          <View className="flex-row items-center gap-2 py-4">
            <Spinner size="sm" />
            <Text className="text-sm text-text-secondary">Loading…</Text>
          </View>
        ) : null}
        {!ledger.isPending && entries.length === 0 ? (
          <Text className="text-sm text-text-secondary">
            No Vsolve payout activity yet. Direct customer payments are included in the earnings totals above.
          </Text>
        ) : null}

        {entries.length > 0 ? (
          <View className="overflow-hidden rounded-card border border-line">
            {/* Table header */}
            <View className="flex-row items-center justify-between bg-surface-sunken px-4 py-2">
              <Text className="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted">
                Status
              </Text>
              <Text className="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted">
                Amount
              </Text>
            </View>

            {/* Entries */}
            <View className="divide-y divide-line">
              {entries.map((entry) => (
                <View key={entry.id} className="flex-row items-center justify-between gap-3 bg-surface px-4 py-3">
                  <View className="min-w-0 flex-1">
                    <View className="self-start">
                      <Badge tone={STATUS_TONE[entry.status] ?? "neutral"}>
                        {STATUS_LABEL[entry.status] ?? entry.status}
                      </Badge>
                    </View>
                    <Text className="mt-1 text-sm text-text-secondary">
                      <Text className="font-medium text-text">{formatMoney(entry.gross_paise)}</Text>
                      {" for the work"}
                      {entry.commission_paise > 0 ? ` less ${formatMoney(entry.commission_paise)} commission` : ""}
                    </Text>
                    {entry.reason ? <Text className="mt-0.5 text-xs text-text-muted">{entry.reason}</Text> : null}
                  </View>
                  <Text className="text-base font-bold text-text">{formatMoney(entry.net_paise)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {ledger.hasNextPage ? (
          <Button variant="outline" loading={ledger.isFetchingNextPage} loadingLabel="Loading" onPress={() => void ledger.fetchNextPage()}>
            Load more
          </Button>
        ) : null}
      </View>
    </ScrollView>
  );
}
