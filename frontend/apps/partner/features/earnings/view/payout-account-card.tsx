"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Field, Input, formatDate } from "@vsolve/ui";
import { useState, type FormEvent } from "react";

import { Pictogram } from "@/components/pictogram";

import {
  isNoPayoutAccount,
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
  const masked = <span data-numeric>••••{account.account_last4}</span>;
  if (account.status === "REJECTED") {
    return (
      <p className="text-sm text-danger-text">
        We could not use {masked}
        {account.rejection_reason ? `: ${account.rejection_reason}` : "."} Enter your bank
        details again below.
      </p>
    );
  }
  if (account.status === "PENDING") {
    return (
      <p className="text-sm text-text-secondary">
        We are checking {masked} ({account.ifsc}, {account.holder_name}) before paying into it.
      </p>
    );
  }
  if (!account.is_payable_now) {
    return (
      <p className="text-sm text-text-secondary">
        Verified. Payouts to {masked} start on{" "}
        <time dateTime={account.effective_from}>{formatDate(account.effective_from)}</time>.
      </p>
    );
  }
  return (
    <p className="text-sm text-text-secondary">
      Paying into {masked} · {account.ifsc} · {account.holder_name}
    </p>
  );
}

const BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  PENDING: { label: "Being checked", tone: "warning" },
  VERIFIED: { label: "Verified", tone: "success" },
  REJECTED: { label: "Needs attention", tone: "danger" },
};

/**
 * Where Vsolve pays the Partner, and the way to add or change it.
 *
 * A new account is never payable straight away: Operations checks it, and a 24-hour cooling
 * period runs from the moment it is added. Both are said plainly here, because a verified
 * account with no money arriving otherwise reads as a fault.
 */
export function PayoutAccountCard() {
  const account = usePartnerPayoutAccount();
  const submit = useSubmitPayoutAccount();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PayoutAccountInput>(EMPTY);

  const none = account.isError && isNoPayoutAccount(account.error);
  const current = account.data;
  const showForm = editing || none || current?.status === "REJECTED";
  const badge = current ? BADGE[current.status] : undefined;

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
          setEditing(false);
        },
      },
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-surface text-info-text">
          <Pictogram name="money" size="sm" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-text">Payout account</h2>
            {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
          </div>
          {account.isPending ? (
            <p className="text-sm text-text-secondary">Loading your payout account…</p>
          ) : account.isError && !none ? (
            <p className="text-sm text-text-secondary">
              We could not load your payout account.{" "}
              <button type="button" className="font-semibold text-action underline" onClick={() => void account.refetch()}>
                Try again
              </button>
            </p>
          ) : current ? (
            <StatusLine account={current} />
          ) : (
            <p className="text-sm text-text-secondary">
              Add the bank account Vsolve should pay your earnings into.
            </p>
          )}
          {current && !showForm ? (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Change account
            </Button>
          ) : null}
        </div>
      </div>

      {showForm && !account.isPending ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit} noValidate>
          {current && current.status !== "REJECTED" ? (
            <p className="rounded-plate bg-warning-surface px-3 py-2 text-xs leading-5 text-warning-text sm:col-span-2">
              Changing your account pauses payouts until we have checked the new one and 24
              hours have passed. This protects your earnings if someone else gets into your
              account.
            </p>
          ) : null}
          <Field label="Account holder name" required error={fieldError(submit.error, "holder_name")} className="sm:col-span-2">
            <Input
              autoComplete="name"
              value={form.holder_name}
              placeholder="As printed on your passbook"
              onChange={(event) => update("holder_name", event.target.value)}
            />
          </Field>
          <Field label="Account number" required error={fieldError(submit.error, "account_number")}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              value={form.account_number}
              onChange={(event) => update("account_number", event.target.value)}
            />
          </Field>
          <Field label="Confirm account number" required error={fieldError(submit.error, "confirm_account_number")}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              onPaste={(event) => event.preventDefault()}
              value={form.confirm_account_number}
              onChange={(event) => update("confirm_account_number", event.target.value)}
            />
          </Field>
          <Field label="IFSC" required error={fieldError(submit.error, "ifsc")}>
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
              loadingLabel="Saving"
              disabled={!form.holder_name || !form.account_number || !form.confirm_account_number || !form.ifsc}
            >
              Save bank account
            </Button>
            {current && editing ? (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
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
