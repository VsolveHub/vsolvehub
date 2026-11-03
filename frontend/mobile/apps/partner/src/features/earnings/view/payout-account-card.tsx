// Ported from frontend/apps/partner/features/earnings/view/payout-account-card.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { describeError } from "@vsolve/query/native";
import { Badge, Button, Card, COLOR_TOKENS, Field, Input, Sheet, Spinner, Text, formatMoney, useT } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";
import { AlertCircle, Building2 } from "lucide-react-native";

import {
  isNoPayoutAccount,
  usePartnerBalance,
  usePartnerPayoutAccount,
  useSubmitPayoutAccount,
  type PayoutAccount,
  type PayoutAccountInput,
} from "../queries";

const EMPTY: PayoutAccountInput = {
  holder_name: "",
  account_number: "",
  confirm_account_number: "",
  ifsc: "",
};

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function fieldError(error: unknown, field: keyof PayoutAccountInput): string | undefined {
  return error instanceof ApiRequestError ? error.fieldErrors[field]?.[0] : undefined;
}

function StatusLine({ account }: { account: PayoutAccount }) {
  const t = useT();
  const masked = `••••${account.account_last4}`;
  if (account.status === "REJECTED") {
    return (
      <View className="mt-1 flex-col gap-1">
        <Text className="text-sm font-medium text-rose-600">
          {t("money.payout.rejected.lead")} {masked}
          {account.rejection_reason ? `: ${account.rejection_reason}` : "."}
        </Text>
        <Text className="text-xs text-rose-500">
          {t("money.payout.rejected.action")}
        </Text>
      </View>
    );
  }
  if (account.status === "PENDING") {
    return (
      <View className="mt-1 flex-col gap-1">
        <Text className="text-sm text-text-secondary">
          {t("money.payout.pending.lead")} {masked} ({account.ifsc}, {account.holder_name}).
        </Text>
        <Text className="text-xs text-amber-700">
          {t("money.payout.pending.action")}
        </Text>
      </View>
    );
  }
  if (!account.is_payable_now) {
    const effective = new Date(account.effective_from).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return (
      <View className="mt-1 flex-col gap-1">
        <Text className="text-sm text-text-secondary">
          {t("money.payout.notPayableYet.lead")} {masked} {t("money.payout.notPayableYet.action")} {effective}.
        </Text>
        <Text className="text-xs text-text-muted">
          {t("money.payout.coolingNote")}
        </Text>
      </View>
    );
  }
  return (
    <Text className="mt-1 text-sm text-text-secondary">
      {t("money.payout.active.lead")} · {masked} · {account.ifsc} · {account.holder_name}
    </Text>
  );
}

function badgeFor(
  t: ReturnType<typeof useT>,
  status: string | null,
): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
} {
  if (status === null) return { label: t("money.payout.badge.notAdded"), tone: "neutral" };
  if (status === "PENDING") return { label: t("money.payout.badge.pending"), tone: "warning" };
  if (status === "VERIFIED") return { label: t("money.payout.badge.verified"), tone: "success" };
  if (status === "REJECTED") return { label: t("money.payout.badge.rejected"), tone: "danger" };
  return { label: status, tone: "neutral" };
}

export function PayoutAccountCard() {
  const t = useT();
  const account = usePartnerPayoutAccount();
  const balance = usePartnerBalance();
  const submit = useSubmitPayoutAccount();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<PayoutAccountInput>(EMPTY);
  const [localErrors, setLocalErrors] = useState<Partial<Record<keyof PayoutAccountInput, string>>>({});

  const none = (account.isError && isNoPayoutAccount(account.error)) || account.data === null;
  const current = account.data;
  const badge = current ? badgeFor(t, current.status) : none ? badgeFor(t, null) : undefined;
  const waitingPaise = balance.data?.withdrawable_paise ?? balance.data?.available_paise ?? 0;

  const openForm = () => {
    setForm(EMPTY);
    setLocalErrors({});
    setSheetOpen(true);
  };

  const closeForm = () => {
    setSheetOpen(false);
    setLocalErrors({});
  };

  const update = (field: keyof PayoutAccountInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setLocalErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async () => {
    const errors: Partial<Record<keyof PayoutAccountInput, string>> = {};

    const cleanHolder = form.holder_name.trim();
    const cleanAccount = form.account_number.trim();
    const cleanConfirm = form.confirm_account_number.trim();
    const cleanIfsc = form.ifsc.trim().toUpperCase();

    if (!cleanHolder) {
      errors.holder_name = t("money.payout.error.holderNameRequired");
    }
    if (!cleanAccount) {
      errors.account_number = t("money.payout.error.accountNumberRequired");
    } else if (cleanAccount.length < 9 || cleanAccount.length > 18) {
      errors.account_number = t("money.payout.error.accountNumberDigits");
    }
    if (cleanAccount !== cleanConfirm) {
      errors.confirm_account_number = t("money.payout.error.accountNumberMismatch");
    }
    if (!cleanIfsc) {
      errors.ifsc = t("money.payout.error.ifscRequired");
    } else if (!IFSC_REGEX.test(cleanIfsc)) {
      errors.ifsc = t("money.payout.error.ifscInvalid");
    }

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      return;
    }

    try {
      await submit.mutateAsync({
        holder_name: cleanHolder,
        account_number: cleanAccount,
        confirm_account_number: cleanConfirm,
        ifsc: cleanIfsc,
      });
      setForm(EMPTY);
      setSheetOpen(false);
    } catch {
      // Server error handled via submit.error
    }
  };

  return (
    <>
      <Card className="p-4 sm:p-5">
        <View className="flex-row items-start gap-3">
          <View className="size-10 shrink-0 items-center justify-center rounded-xl bg-info-surface">
            <Building2 size={20} color={COLOR_TOKENS.info} />
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-sm font-semibold text-text">{t("money.payout.heading")}</Text>
              {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
            </View>

            {account.isPending ? (
              <View className="mt-2 flex-row items-center gap-2">
                <Spinner size="sm" />
                <Text className="text-sm text-text-secondary">{t("money.payout.loading")}</Text>
              </View>
            ) : account.isError && !none ? (
              <View className="mt-1">
                <Text className="text-sm text-text-secondary">
                  {t("money.payout.loadError")}{" "}
                  <Text
                    className="font-semibold text-action underline"
                    onPress={() => void account.refetch()}
                  >
                    {t("common.tryAgain")}
                  </Text>
                </Text>
              </View>
            ) : current ? (
              <StatusLine account={current} />
            ) : (
              <Text className="mt-1 text-sm text-text-secondary">
                {waitingPaise > 0
                  ? t("money.payout.moneyWaiting", { amount: formatMoney(waitingPaise) })
                  : t("money.payout.noAccount")}
              </Text>
            )}

            {none ? (
              <View className="mt-3">
                <Button variant="primary" size="sm" onPress={openForm}>
                  {t("money.payout.addAccount")}
                </Button>
                <Text className="mt-2 text-xs leading-relaxed text-text-muted">
                  {t("money.payout.privacyNote")}
                </Text>
              </View>
            ) : null}

            {current ? (
              <View className="mt-3 flex-row">
                <Button variant="outline" size="sm" onPress={openForm}>
                  {t("money.payout.changeAccount")}
                </Button>
              </View>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Bank Account Entry Bottom Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={current ? t("money.payout.changeAccount") : t("money.payout.addAccount")}
        description={t("money.payout.sheetDescription")}
      >
        <View className="gap-3.5 py-1">
          {current && current.status !== "REJECTED" ? (
            <View className="rounded-2xl border border-warning-line bg-warning-surface p-3">
              <Text className="text-xs leading-relaxed text-warning-text">
                {t("money.payout.changeWarning")}
              </Text>
            </View>
          ) : null}

          <Field
            label={t("money.payout.field.holderName")}
            required
            error={localErrors.holder_name || fieldError(submit.error, "holder_name")}
          >
            <Input
              autoCapitalize="words"
              value={form.holder_name}
              placeholder={t("money.payout.field.holderNamePlaceholder")}
              onChangeText={(text) => update("holder_name", text)}
            />
          </Field>

          <Field
            label={t("money.payout.field.accountNumber")}
            required
            error={localErrors.account_number || fieldError(submit.error, "account_number")}
          >
            <Input
              keyboardType="number-pad"
              value={form.account_number}
              placeholder={t("money.payout.field.accountNumberPlaceholder")}
              onChangeText={(text) => update("account_number", text.replace(/\D/g, ""))}
            />
          </Field>

          <Field
            label={t("money.payout.field.confirmAccountNumber")}
            required
            error={localErrors.confirm_account_number || fieldError(submit.error, "confirm_account_number")}
          >
            <Input
              keyboardType="number-pad"
              value={form.confirm_account_number}
              placeholder={t("money.payout.field.confirmAccountNumberPlaceholder")}
              onChangeText={(text) => update("confirm_account_number", text.replace(/\D/g, ""))}
            />
          </Field>

          <Field
            label={t("money.payout.field.ifsc")}
            required
            error={localErrors.ifsc || fieldError(submit.error, "ifsc")}
          >
            <Input
              autoCapitalize="characters"
              maxLength={11}
              value={form.ifsc}
              placeholder="SBIN0001234"
              onChangeText={(text) => update("ifsc", text.toUpperCase())}
            />
          </Field>

          {submit.isError && !(submit.error instanceof ApiRequestError && Object.keys(submit.error.fieldErrors).length > 0) ? (
            <View className="flex-row items-center gap-2 rounded-xl bg-rose-50 p-3">
              <AlertCircle size={16} color={COLOR_TOKENS.danger} />
              <Text className="flex-1 text-xs font-medium text-rose-700">
                {describeError(submit.error, "financial").message}
              </Text>
            </View>
          ) : null}

          <View className="mt-3 flex-row items-center justify-end gap-2.5">
            <Button variant="ghost" size="md" onPress={closeForm} disabled={submit.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={submit.isPending}
              loadingLabel={t("common.saving")}
              onPress={handleSubmit}
              disabled={
                !form.holder_name ||
                !form.account_number ||
                !form.confirm_account_number ||
                !form.ifsc
              }
            >
              {t("money.payout.saveAccount")}
            </Button>
          </View>
        </View>
      </Sheet>
    </>
  );
}
