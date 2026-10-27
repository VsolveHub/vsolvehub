"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Field, Input, formatDate, formatMoney, useT } from "@vsolve/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Pictogram } from "@/components/pictogram";

import { ADD_BANK_ACCOUNT_ID } from "../model/bank-account-link";
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

function fieldError(error: unknown, field: keyof PayoutAccountInput): string | undefined {
  return error instanceof ApiRequestError ? error.fieldErrors[field]?.[0] : undefined;
}

function StatusLine({ account }: { account: PayoutAccount }) {
  const t = useT();
  const masked = <span data-numeric>••••{account.account_last4}</span>;
  if (account.status === "REJECTED") {
    return (
      <p className="text-sm text-danger-text">
        {t("money.payout.rejected.lead")} {masked}
        {account.rejection_reason ? `: ${account.rejection_reason}` : "."}{" "}
        {t("money.payout.rejected.action")}
      </p>
    );
  }
  if (account.status === "PENDING") {
    return (
      <p className="text-sm text-text-secondary">
        {t("money.payout.pending.lead")} {masked} ({account.ifsc}, {account.holder_name}){" "}
        {t("money.payout.pending.action")}
      </p>
    );
  }
  if (!account.is_payable_now) {
    return (
      <p className="text-sm text-text-secondary">
        {t("money.payout.notPayableYet.lead")} {masked} {t("money.payout.notPayableYet.action")}{" "}
        <time dateTime={account.effective_from}>{formatDate(account.effective_from)}</time>.
      </p>
    );
  }
  return (
    <p className="text-sm text-text-secondary">
      {t("money.payout.active.lead")} {masked} · {account.ifsc} · {account.holder_name}
    </p>
  );
}

function badgeFor(t: ReturnType<typeof useT>, status: string | null):
  | { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }
  | undefined {
  if (status === null) return { label: t("money.payout.badge.notAdded"), tone: "neutral" };
  if (status === "PENDING") return { label: t("money.payout.badge.pending"), tone: "warning" };
  if (status === "VERIFIED") return { label: t("money.payout.badge.verified"), tone: "success" };
  if (status === "REJECTED") return { label: t("money.payout.badge.rejected"), tone: "danger" };
  return undefined;
}

/**
 * Where Vsolve pays the Partner, and the way to add or change it.
 *
 * A new account is never payable straight away: Operations checks it, and a 24-hour cooling
 * period runs from the moment it is added. Both are said plainly here, because a verified
 * account with no money arriving otherwise reads as a fault.
 *
 * ## No account yet: one clear action, not a form
 *
 * A Partner with no account sees why it matters — the money already waiting, when there is some
 * — and one "Add bank account" button that opens the form in place. Every other prompt in the app
 * (Withdraw, a job's payout panel, the profile) links to `ADD_BANK_ACCOUNT_HREF`, which lands on
 * this card with the form already open.
 */
export function PayoutAccountCard() {
  const t = useT();
  const account = usePartnerPayoutAccount();
  const balance = usePartnerBalance();
  const submit = useSubmitPayoutAccount();
  const [editing, setEditing] = useState(false);
  const [focusRequested, setFocusRequested] = useState(false);
  const [form, setForm] = useState<PayoutAccountInput>(EMPTY);
  const holderRef = useRef<HTMLInputElement>(null);

  const none = account.isError && isNoPayoutAccount(account.error);
  const current = account.data;
  const showForm = editing || current?.status === "REJECTED";
  const badge = current ? badgeFor(t, current.status) : none ? badgeFor(t, null) : undefined;
  const waitingPaise = balance.data?.withdrawable_paise ?? 0;

  // Arriving by `ADD_BANK_ACCOUNT_HREF` — from another screen or another card on this one —
  // opens the form. The card mounts after the balance has loaded, so the browser's own jump to
  // the anchor has usually happened before it existed; scrolling here is what lands it.
  useEffect(() => {
    function openFromLink() {
      if (window.location.hash !== `#${ADD_BANK_ACCOUNT_ID}`) return;
      setEditing(true);
      setFocusRequested(true);
      document
        .getElementById(ADD_BANK_ACCOUNT_ID)
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
    openFromLink();
    window.addEventListener("hashchange", openFromLink);
    return () => window.removeEventListener("hashchange", openFromLink);
  }, []);

  useEffect(() => {
    if (!focusRequested || !showForm || account.isPending) return;
    holderRef.current?.focus();
    setFocusRequested(false);
  }, [focusRequested, showForm, account.isPending]);

  function openForm() {
    setEditing(true);
    setFocusRequested(true);
  }

  function closeForm() {
    setEditing(false);
    // Drop the anchor, so following the same link again reopens the form.
    if (window.location.hash === `#${ADD_BANK_ACCOUNT_ID}`) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }

  function update(field: keyof PayoutAccountInput, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit.mutate(
      { ...form, ifsc: form.ifsc.trim().toUpperCase(), holder_name: form.holder_name.trim() },
      {
        onSuccess: () => {
          // The numbers leave component state the moment they have been sent.
          setForm(EMPTY);
          closeForm();
        },
      },
    );
  }

  return (
    <Card id={ADD_BANK_ACCOUNT_ID} className="scroll-mt-24 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-surface text-info-text">
          <Pictogram name="money" size="sm" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-text">{t("money.payout.heading")}</h2>
            {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
          </div>
          {account.isPending ? (
            <p className="text-sm text-text-secondary">{t("money.payout.loading")}</p>
          ) : account.isError && !none ? (
            <p className="text-sm text-text-secondary">
              {t("money.payout.loadError")}{" "}
              <button type="button" className="font-semibold text-action underline" onClick={() => void account.refetch()}>
                {t("common.tryAgain")}
              </button>
            </p>
          ) : current ? (
            <StatusLine account={current} />
          ) : (
            <p className="text-sm text-text-secondary">
              {waitingPaise > 0
                ? t("money.payout.moneyWaiting", { amount: formatMoney(waitingPaise) })
                : t("money.payout.noAccount")}
            </p>
          )}
          {none && !showForm ? (
            <>
              <Button
                className="mt-3 w-full sm:w-auto"
                icon={<Pictogram name="money" size="xs" />}
                onClick={openForm}
              >
                {t("money.payout.addAccount")}
              </Button>
              <p className="mt-2 text-xs leading-5 text-text-muted">{t("money.payout.privacyNote")}</p>
            </>
          ) : null}
          {current && !showForm ? (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t("money.payout.changeAccount")}
            </Button>
          ) : null}
        </div>
      </div>

      {showForm && !account.isPending ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit} noValidate>
          {current && current.status !== "REJECTED" ? (
            <p className="rounded-plate bg-warning-surface px-3 py-2 text-xs leading-5 text-warning-text sm:col-span-2">
              {t("money.payout.changeWarning")}
            </p>
          ) : null}
          <Field label={t("money.payout.field.holderName")} required error={fieldError(submit.error, "holder_name")} className="sm:col-span-2">
            <Input
              ref={holderRef}
              autoComplete="name"
              value={form.holder_name}
              placeholder={t("money.payout.field.holderNamePlaceholder")}
              onChange={(event) => update("holder_name", event.target.value)}
            />
          </Field>
          <Field label={t("money.payout.field.accountNumber")} required error={fieldError(submit.error, "account_number")}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={form.account_number}
              onChange={(event) => update("account_number", event.target.value)}
            />
          </Field>
          <Field label={t("money.payout.field.confirmAccountNumber")} required error={fieldError(submit.error, "confirm_account_number")}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              onPaste={(event) => event.preventDefault()}
              value={form.confirm_account_number}
              onChange={(event) => update("confirm_account_number", event.target.value)}
            />
          </Field>
          <Field label={t("money.payout.field.ifsc")} required error={fieldError(submit.error, "ifsc")}>
            <Input
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={11}
              value={form.ifsc}
              placeholder="SBIN0001234"
              onChange={(event) => update("ifsc", event.target.value.toUpperCase())}
            />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button
              type="submit"
              loading={submit.isPending}
              loadingLabel={t("common.saving")}
              disabled={!form.holder_name || !form.account_number || !form.confirm_account_number || !form.ifsc}
            >
              {t("money.payout.saveAccount")}
            </Button>
            {editing && current?.status !== "REJECTED" ? (
              <Button type="button" variant="ghost" onClick={closeForm}>
                {t("common.cancel")}
              </Button>
            ) : null}
          </div>
          {submit.isError && !(submit.error instanceof ApiRequestError && Object.keys(submit.error.fieldErrors).length > 0) ? (
            <p role="alert" className="text-sm text-danger-text sm:col-span-2">
              {friendlyErrorMessage(submit.error)}
            </p>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}
