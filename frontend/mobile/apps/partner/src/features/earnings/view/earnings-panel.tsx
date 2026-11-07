// Ported from frontend/apps/partner/features/earnings/view/earnings-panel.tsx
import { Badge, Button, Card, ErrorState, Spinner, Text, cn, formatMoney, useT } from "@vsolve/mobile-ui";
import { RefreshControl, ScrollView, View } from "react-native";

import { Pictogram, type PictogramName } from "@/features/work-stack/view/pictogram";
import { EarningsChart, toDailyEarnings } from "./earnings-chart";
import { PayoutAccountCard } from "./payout-account-card";
import { WithdrawCard } from "./withdraw-card";
import {
  usePartnerBalance,
  usePartnerLedger,
  usePartnerPerformance,
} from "../queries";

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning"> = {
  PENDING: "warning",
  AVAILABLE: "info",
  RESERVED: "info",
  PAID: "success",
  RELEASED: "neutral",
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
  const t = useT();
  const balance = usePartnerBalance();
  const ledger = usePartnerLedger();
  const performance = usePartnerPerformance();

  const isRefreshing =
    balance.isRefetching || ledger.isRefetching || performance.isRefetching;

  const handleRefresh = () => {
    void balance.refetch();
    void ledger.refetch();
    void performance.refetch();
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PENDING":
        return t("money.earnings.status.pending");
      case "AVAILABLE":
        return t("money.earnings.status.available");
      case "RESERVED":
        return t("money.earnings.status.reserved");
      case "PAID":
        return t("money.earnings.status.paid");
      case "RELEASED":
        return t("money.earnings.status.released");
      default:
        return status;
    }
  };

  if (balance.isPending) {
    return (
      <Card className="m-4 flex-row items-center gap-2 p-6">
        <Spinner size="sm" />
        <Text className="text-text-secondary">{t("money.earnings.loading.ariaLabel")}…</Text>
      </Card>
    );
  }
  if (balance.isError || !balance.data) {
    return (
      <ErrorState
        title={t("money.earnings.error.title")}
        message={t("common.nothingChanged")}
        actionLabel={t("common.tryAgain")}
        onAction={() => void balance.refetch()}
      />
    );
  }

  const data = balance.data;
  const entries = ledger.data?.pages.flatMap((page) => page.results) ?? [];
  const vsolveOutstanding = data.available_paise + data.reserved_paise + data.pending_paise;
  const monthDirect = performance.data?.month_direct_paise ?? 0;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-4 py-5"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          colors={["#EA580C"]}
          tintColor="#EA580C"
        />
      }
    >
      {/* Warning banner */}
      {data.pending_paise > 0 ? (
        <View className="flex-row gap-3 rounded-card border border-warning-line bg-warning-surface p-4">
          <Pictogram name="later" size="sm" className="mt-0.5 shrink-0 text-warning-text" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-warning-text">
              {t("money.earnings.onHold.title")}
            </Text>
            <Text className="mt-0.5 text-sm text-warning-text/80">
              {t("money.earnings.onHold.body")}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Total earned this month */}
      <Card className="p-5">
        <Text className="text-sm font-semibold text-text-secondary">
          {t("money.earnings.totalThisMonth.title")}
        </Text>
        {performance.isPending ? (
          <View className="mt-3 flex-row items-center gap-2">
            <Spinner size="sm" />
            <Text className="text-sm text-text-secondary">
              {t("money.earnings.totalThisMonth.loading")}
            </Text>
          </View>
        ) : performance.isError || !performance.data ? (
          <Text className="mt-2 text-sm text-text-secondary">
            {t("money.earnings.totalThisMonth.unavailable")}
          </Text>
        ) : (
          <>
            <Text className="mt-1 text-4xl font-bold leading-tight text-text">
              {formatMoney(performance.data.month_net_paise)}
            </Text>
            <Text className="mt-2 text-sm text-text-secondary">
              {monthDirect > 0
                ? t("money.earnings.totalThisMonth.directNote", {
                    amount: formatMoney(monthDirect),
                  })
                : t("money.earnings.totalThisMonth.genericNote")}
            </Text>
          </>
        )}
      </Card>

      {/* Vsolve payout balance */}
      <Card className="p-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-text-secondary">
              {t("money.earnings.vsolveBalance.title")}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-text-secondary">
              {t("money.earnings.vsolveBalance.subtitle")}
            </Text>
          </View>
          <Text className="shrink-0 text-2xl font-bold text-text">
            {formatMoney(vsolveOutstanding)}
          </Text>
        </View>

        {vsolveOutstanding === 0 && monthDirect > 0 ? (
          <Text className="mt-3 rounded-plate bg-info-surface px-3 py-2 text-xs leading-5 text-info-text">
            {t("money.earnings.vsolveBalance.nothingDue", { amount: formatMoney(monthDirect) })}
          </Text>
        ) : null}

        <View className="mt-4 flex-row flex-wrap gap-2">
          <BalanceTile
            label={t("money.earnings.tile.ready")}
            amountPaise={data.available_paise}
            tone="info"
            icon="money"
          />
          <BalanceTile
            label={t("money.earnings.tile.onTheWay")}
            amountPaise={data.reserved_paise}
            tone="info"
            icon="held"
          />
          <BalanceTile
            label={t("money.earnings.tile.onHold")}
            amountPaise={data.pending_paise}
            tone="warning"
            icon="later"
          />
          <BalanceTile
            label={t("money.earnings.status.paid")}
            amountPaise={data.paid_paise}
            tone="success"
            icon="done"
          />
        </View>
      </Card>

      {/* Immediate Withdrawal Action Card */}
      <WithdrawCard />

      {/* Bank Account / Payout Method Card with Bottom Sheet */}
      <PayoutAccountCard />

      {/* How you are doing */}
      <Card className="p-5">
        <Text className="text-base font-bold text-text">
          {t("money.earnings.howYouAreDoing")}
        </Text>
        <View className="mt-3">
          {performance.isError ? (
            <View className="rounded-card border border-line bg-surface-sunken p-4">
              <Text className="text-sm text-text-secondary">
                {t("money.earnings.trend.error")}
              </Text>
            </View>
          ) : performance.isPending || !performance.data ? (
            <View className="flex-row items-center gap-2 p-4">
              <Spinner size="sm" />
              <Text className="text-sm text-text-secondary">
                {t("money.earnings.trend.loading")}
              </Text>
            </View>
          ) : (
            <EarningsChart days={toDailyEarnings(performance.data.daily)} />
          )}
        </View>
      </Card>

      {/* Recent Activity */}
      <View className="gap-2">
        <Text className="text-base font-bold text-text">
          {t("money.earnings.recentActivity")}
        </Text>
        {ledger.isPending ? (
          <View className="flex-row items-center gap-2 py-4">
            <Spinner size="sm" />
            <Text className="text-sm text-text-secondary">
              {t("money.earnings.loading")}
            </Text>
          </View>
        ) : null}
        {!ledger.isPending && entries.length === 0 ? (
          <Text className="text-sm text-text-secondary">
            {t("money.earnings.noActivity")}
          </Text>
        ) : null}

        {entries.length > 0 ? (
          <View className="overflow-hidden rounded-card border border-line">
            {/* Table header */}
            <View className="flex-row items-center justify-between bg-surface-sunken px-4 py-2">
              <Text className="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted">
                {t("money.earnings.table.status")}
              </Text>
              <Text className="text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted">
                {t("money.earnings.table.amount")}
              </Text>
            </View>

            {/* Entries */}
            <View className="divide-y divide-line">
              {entries.map((entry) => (
                <View key={entry.id} className="flex-row items-center justify-between gap-3 bg-surface px-4 py-3">
                  <View className="min-w-0 flex-1">
                    <View className="self-start">
                      <Badge tone={STATUS_TONE[entry.status] ?? "neutral"}>
                        {getStatusLabel(entry.status)}
                      </Badge>
                    </View>
                    <Text className="mt-1 text-sm text-text-secondary">
                      <Text className="font-medium text-text">{formatMoney(entry.gross_paise)}</Text>
                      {" "}
                      {entry.commission_paise > 0
                        ? t("money.earnings.entry.lessCommission", {
                            amount: formatMoney(entry.commission_paise),
                          })
                        : ""}
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
          <Button variant="outline" loading={ledger.isFetchingNextPage} loadingLabel={t("money.earnings.loading")} onPress={() => void ledger.fetchNextPage()}>
            {t("money.earnings.loadMore")}
          </Button>
        ) : null}
      </View>
    </ScrollView>
  );
}
