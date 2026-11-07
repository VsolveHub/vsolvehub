// Ported from frontend/apps/partner/features/earnings/view/withdraw-card.tsx
import { describeError } from "@vsolve/query/native";
import {
  Badge,
  Button,
  Card,
  COLOR_TOKENS,
  ConfirmAction,
  Spinner,
  Text,
  formatMoney,
  useT,
} from "@vsolve/mobile-ui";
import { ArrowDownToLine } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import {
  isWithdrawalRefused,
  usePartnerWithdrawals,
  useRequestWithdrawal,
  useWithdrawalPreview,
  type Withdrawal,
  type WithdrawalPreview,
} from "../queries";

const STEP_KEY: Record<Withdrawal["status"], string> = {
  REQUESTED: "money.withdraw.step.requested",
  SENT: "money.withdraw.step.sent",
  PAID: "money.withdraw.step.paid",
  FAILED: "money.withdraw.step.failed",
};

const STEP_TONE: Record<Withdrawal["status"], "neutral" | "info" | "success" | "danger"> = {
  REQUESTED: "info",
  SENT: "info",
  PAID: "success",
  FAILED: "danger",
};

const STEPS: Withdrawal["status"][] = ["REQUESTED", "SENT", "PAID"];

function Progress({ withdrawal }: { withdrawal: Withdrawal }) {
  const t = useT();
  if (withdrawal.status === "FAILED") return null;
  const reached = STEPS.indexOf(withdrawal.status);
  return (
    <View className="mt-3 flex-row items-center gap-1.5" accessibilityLabel="Withdrawal progress">
      {STEPS.map((step, index) => (
        <View key={step} className="flex-1 flex-col gap-1">
          <View
            className={`h-1.5 rounded-full ${index <= reached ? "bg-emerald-500" : "bg-line"}`}
          />
          <Text
            className={`text-[0.625rem] font-semibold ${
              index <= reached ? "text-text" : "text-text-muted"
            }`}
          >
            {t(STEP_KEY[step])}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WithdrawalRow({ withdrawal }: { withdrawal: Withdrawal }) {
  const t = useT();
  const formattedDate = new Date(withdrawal.requested_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View className="bg-surface px-4 py-3 border-b border-line/50">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Badge tone={STEP_TONE[withdrawal.status] ?? "neutral"}>
            {t(STEP_KEY[withdrawal.status])}
          </Badge>
          <Text className="mt-1 text-xs text-text-secondary">
            {formattedDate} · {t("money.withdraw.toAccount", { last4: withdrawal.account_last4 })}
          </Text>
        </View>
        <View className="shrink-0 items-end">
          <Text className="text-base font-bold text-text">
            {formatMoney(withdrawal.amount_paise)}
          </Text>
          {withdrawal.fee_paise > 0 ? (
            <Text className="text-xs text-text-muted">
              {t("money.withdraw.afterFee", { fee: formatMoney(withdrawal.fee_paise) })}
            </Text>
          ) : null}
        </View>
      </View>
      {withdrawal.status === "REQUESTED" && withdrawal.is_awaiting_review ? (
        <Text className="mt-2 text-xs leading-5 text-text-secondary">
          {t("money.withdraw.reviewNote")}
        </Text>
      ) : null}
      {withdrawal.status === "PAID" && withdrawal.utr ? (
        <Text className="mt-2 text-xs text-text-secondary">
          {t("money.withdraw.bankRef", { utr: withdrawal.utr })}
        </Text>
      ) : null}
      {withdrawal.failure_message ? (
        <Text className="mt-2 text-xs leading-5 text-rose-600">{withdrawal.failure_message}</Text>
      ) : null}
      <Progress withdrawal={withdrawal} />
    </View>
  );
}

function WhyNot({
  preview,
  onAddAccount,
}: {
  preview: WithdrawalPreview;
  onAddAccount?: () => void;
}) {
  const t = useT();
  if (!preview.refusal_message) return null;
  const needsAccount =
    preview.refusal_reason === "no_payout_account" || preview.refusal_reason === "account_rejected";

  const coolingDate =
    preview.refusal_reason === "account_cooling" && preview.account_payable_from
      ? new Date(preview.account_payable_from).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <View className="mt-3">
      <View className="rounded-2xl border border-line bg-surface-sunken p-3">
        <Text className="text-xs leading-relaxed text-text-secondary">
          {preview.refusal_message}
          {coolingDate ? ` ${t("money.withdraw.coolingFrom", { date: coolingDate })}` : ""}
        </Text>
      </View>
      {needsAccount && onAddAccount ? (
        <View className="mt-2.5 flex-row">
          <Button variant="outline" size="sm" onPress={onAddAccount}>
            {preview.refusal_reason === "account_rejected"
              ? t("money.payout.enterAgain")
              : t("money.payout.addAccount")}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

export function WithdrawCard({ onOpenAccountSheet }: { onOpenAccountSheet?: () => void }) {
  const t = useT();
  const preview = useWithdrawalPreview();
  const withdrawals = usePartnerWithdrawals();
  const withdraw = useRequestWithdrawal();
  const [confirming, setConfirming] = useState(false);

  if (preview.isPending) {
    return (
      <Card className="p-5">
        <View className="flex-row items-center gap-2">
          <Spinner size="sm" />
          <Text className="text-sm text-text-secondary">{t("money.withdraw.checking")}</Text>
        </View>
      </Card>
    );
  }

  // Withdrawals off, or preview unreachable: hide card gracefully as web does
  if (preview.isError || !preview.data?.is_enabled) return null;

  const data = preview.data;
  const recent = withdrawals.data?.pages.flatMap((page) => page.results) ?? [];
  const failure =
    withdraw.error && !isWithdrawalRefused(withdraw.error)
      ? describeError(withdraw.error, "financial").message
      : null;
  const refusal =
    withdraw.error && isWithdrawalRefused(withdraw.error)
      ? (withdraw.error as Error).message
      : null;

  const confirm = () => {
    withdraw.mutate(undefined, { onSettled: () => setConfirming(false) });
  };

  return (
    <>
      <Card className="p-4 sm:p-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1">
            <Text className="text-base font-bold text-text">{t("money.withdraw.heading")}</Text>
            <Text className="mt-1 text-xs leading-5 text-text-secondary">
              {t("money.withdraw.subheading")}
            </Text>
          </View>
          <View className="size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ArrowDownToLine size={20} color={COLOR_TOKENS.action} />
          </View>
        </View>

        <View className="mt-4">
          <Button
            variant="primary"
            size="lg"
            disabled={!data.can_withdraw}
            loading={withdraw.isPending}
            loadingLabel={t("money.withdraw.sending")}
            onPress={() => setConfirming(true)}
          >
            {data.can_withdraw
              ? t("money.withdraw.actionAmount", { amount: formatMoney(data.send_paise) })
              : t("money.withdraw.action")}
          </Button>
        </View>

        {data.can_withdraw ? (
          <Text className="mt-2 text-center text-xs text-text-secondary">
            {data.fee_paise > 0
              ? t("money.withdraw.feeNote", {
                  amount: formatMoney(data.amount_paise),
                  fee: formatMoney(data.fee_paise),
                })
              : t("money.withdraw.freeNote")}
          </Text>
        ) : null}

        <WhyNot preview={data} onAddAccount={onOpenAccountSheet} />

        {refusal ? (
          <View className="mt-3 rounded-xl bg-rose-50 p-3">
            <Text className="text-xs font-semibold text-rose-700">{refusal}</Text>
          </View>
        ) : null}

        {failure ? (
          <View className="mt-3 rounded-xl bg-rose-50 p-3">
            <Text className="text-xs font-medium text-rose-700">
              {t("money.withdraw.failureSafety", { failure })}
            </Text>
          </View>
        ) : null}

        {recent.length > 0 ? (
          <View className="mt-5">
            <Text className="text-sm font-semibold text-text-secondary">
              {t("money.withdraw.recent")}
            </Text>
            <View className="mt-2 overflow-hidden rounded-2xl border border-line">
              {recent.map((item) => (
                <WithdrawalRow key={item.id} withdrawal={item} />
              ))}
            </View>
            {withdrawals.hasNextPage ? (
              <View className="mt-3 flex-row justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  loading={withdrawals.isFetchingNextPage}
                  loadingLabel={t("money.earnings.loading")}
                  onPress={() => void withdrawals.fetchNextPage()}
                >
                  {t("money.earnings.loadMore")}
                </Button>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={t("money.withdraw.confirmTitle", { amount: formatMoney(data.send_paise) })}
        consequence={
          <View className="gap-2">
            <Text className="text-sm text-text-secondary">
              {t("money.withdraw.confirmBody", {
                amount: formatMoney(data.amount_paise),
                last4: data.account_last4 || "",
              })}
              {data.fee_paise > 0
                ? ` ${t("money.withdraw.confirmFeeNote", { fee: formatMoney(data.fee_paise) })}`
                : ""}
            </Text>
            <Text className="text-xs text-text-muted">
              {data.needs_review
                ? t("money.withdraw.confirmReviewNote")
                : t("money.withdraw.confirmInstantNote")}{" "}
              {t("money.withdraw.confirmRejectNote")}
            </Text>
          </View>
        }
        confirmLabel={t("money.withdraw.action")}
        onConfirm={confirm}
        pending={withdraw.isPending}
      />
    </>
  );
}
