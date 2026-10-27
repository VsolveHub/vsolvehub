"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  Spinner,
  formatDateTime,
  formatMoney,
} from "@vsolve/ui";
import { useState } from "react";

import { Pictogram } from "@/components/pictogram";

import {
  isWithdrawalRefused,
  usePartnerWithdrawals,
  useRequestWithdrawal,
  useWithdrawalPreview,
  type Withdrawal,
  type WithdrawalPreview,
} from "../queries";

/**
 * Withdraw the whole available balance, and follow it to the bank.
 *
 * ## The server decides, the screen shows
 *
 * Whether the button is live, the amount, the fee and why not all come from
 * `/partner/withdrawals/preview/`, which runs the same rules as the request. Nothing here works a
 * limit out for itself, so the button never offers what the request would then refuse.
 *
 * ## Four states, one line each
 *
 * Requested → Sent → Paid, or Failed with the money back. A Partner waiting for money wants to
 * know where it is, not the provider's vocabulary.
 *
 * Withdrawals off (`is_enabled` false) draws nothing at all: the balance above is still paid by
 * the regular payout, and a disabled button with no way to enable it only invites a support call.
 */

const STEP_LABEL: Record<Withdrawal["status"], string> = {
  REQUESTED: "Requested",
  SENT: "Sent to bank",
  PAID: "Paid",
  FAILED: "Failed",
};

const STEP_TONE: Record<Withdrawal["status"], "neutral" | "info" | "success" | "danger"> = {
  REQUESTED: "info",
  SENT: "info",
  PAID: "success",
  FAILED: "danger",
};

const STEPS: Withdrawal["status"][] = ["REQUESTED", "SENT", "PAID"];

function Progress({ withdrawal }: { withdrawal: Withdrawal }) {
  if (withdrawal.status === "FAILED") return null;
  const reached = STEPS.indexOf(withdrawal.status);
  return (
    <ol className="mt-3 flex list-none items-center gap-1.5" aria-label="Withdrawal progress">
      {STEPS.map((step, index) => (
        <li key={step} className="flex flex-1 flex-col gap-1">
          <span
            className={`h-1.5 rounded-full ${index <= reached ? "bg-success-text" : "bg-line"}`}
          />
          <span
            className={`text-[0.6875rem] font-semibold ${
              index <= reached ? "text-text" : "text-text-muted"
            }`}
          >
            {STEP_LABEL[step]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function WithdrawalRow({ withdrawal }: { withdrawal: Withdrawal }) {
  return (
    <li className="bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge tone={STEP_TONE[withdrawal.status]}>{STEP_LABEL[withdrawal.status]}</Badge>
          <p className="mt-1 text-xs text-text-secondary">
            <time dateTime={withdrawal.requested_at}>{formatDateTime(withdrawal.requested_at)}</time>
            {" · to "}
            <span data-numeric>••••{withdrawal.account_last4}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p data-numeric className="text-base font-bold text-text">
            {formatMoney(withdrawal.amount_paise)}
          </p>
          {withdrawal.fee_paise > 0 ? (
            <p className="text-xs text-text-muted">
              after <span data-numeric>{formatMoney(withdrawal.fee_paise)}</span> fee
            </p>
          ) : null}
        </div>
      </div>
      {withdrawal.status === "REQUESTED" && withdrawal.is_awaiting_review ? (
        <p className="mt-2 text-xs leading-5 text-text-secondary">
          Our team checks this one before it is sent. Your money is set aside for it.
        </p>
      ) : null}
      {withdrawal.status === "PAID" && withdrawal.utr ? (
        <p className="mt-2 text-xs text-text-secondary">
          Bank reference <span data-numeric>{withdrawal.utr}</span>
        </p>
      ) : null}
      {withdrawal.failure_message ? (
        <p className="mt-2 text-xs leading-5 text-danger-text">{withdrawal.failure_message}</p>
      ) : null}
      <Progress withdrawal={withdrawal} />
    </li>
  );
}

function WhyNot({ preview }: { preview: WithdrawalPreview }) {
  if (!preview.refusal_message) return null;
  return (
    <p className="mt-3 rounded-plate bg-surface-sunken px-3 py-2 text-xs leading-5 text-text-secondary">
      {preview.refusal_message}
      {preview.refusal_reason === "account_cooling" && preview.account_payable_from ? (
        <>
          {" "}
          You can withdraw from{" "}
          <time dateTime={preview.account_payable_from}>
            {formatDateTime(preview.account_payable_from)}
          </time>
          .
        </>
      ) : null}
    </p>
  );
}

export function WithdrawCard() {
  const preview = useWithdrawalPreview();
  const withdrawals = usePartnerWithdrawals();
  const withdraw = useRequestWithdrawal();
  const [confirming, setConfirming] = useState(false);

  if (preview.isPending) {
    return (
      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Checking what you can withdraw…
        </p>
      </Card>
    );
  }
  // Withdrawals off, or the preview unreachable: say nothing rather than guess. The balance is
  // still shown above and still paid in the regular payout.
  if (preview.isError || !preview.data?.is_enabled) return null;

  const data = preview.data;
  const recent = withdrawals.data?.pages.flatMap((page) => page.results) ?? [];
  const failure =
    withdraw.error && !isWithdrawalRefused(withdraw.error)
      ? friendlyErrorMessage(withdraw.error)
      : null;
  const refusal = withdraw.error && isWithdrawalRefused(withdraw.error) ? withdraw.error.message : null;

  const confirm = () => {
    withdraw.mutate(undefined, { onSettled: () => setConfirming(false) });
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text">Withdraw</h2>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Your whole ready balance goes to your bank in one payment.
          </p>
        </div>
        <Pictogram name="money" size="sm" className="shrink-0 text-text-secondary" />
      </div>

      <Button
        className="mt-4 w-full"
        disabled={!data.can_withdraw}
        loading={withdraw.isPending}
        loadingLabel="Sending"
        onClick={() => setConfirming(true)}
      >
        {data.can_withdraw ? `Withdraw ${formatMoney(data.send_paise)}` : "Withdraw"}
      </Button>

      {data.can_withdraw ? (
        <p className="mt-2 text-center text-xs text-text-secondary">
          {data.fee_paise > 0
            ? `${formatMoney(data.amount_paise)} less a ${formatMoney(data.fee_paise)} fee for an extra withdrawal this week.`
            : "Free. One withdrawal a week is on us."}
        </p>
      ) : null}

      <WhyNot preview={data} />

      {refusal ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {refusal}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {failure} If money was set aside, it shows below — tapping again will not withdraw twice.
        </p>
      ) : null}

      {recent.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-text-secondary">Your withdrawals</h3>
          <ul className="mt-2 list-none divide-y divide-line overflow-hidden rounded-card border border-line">
            {recent.map((item) => (
              <WithdrawalRow key={item.id} withdrawal={item} />
            ))}
          </ul>
          {withdrawals.hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                loading={withdrawals.isFetchingNextPage}
                loadingLabel="Loading"
                onClick={() => void withdrawals.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={`Send ${formatMoney(data.send_paise)} to your bank?`}
        consequence={
          <>
            <p>
              Your whole ready balance of{" "}
              <span data-numeric className="font-semibold text-text">
                {formatMoney(data.amount_paise)}
              </span>{" "}
              goes to the account ending{" "}
              <span data-numeric className="font-semibold text-text">
                {data.account_last4}
              </span>
              .
              {data.fee_paise > 0
                ? ` A ${formatMoney(data.fee_paise)} fee comes off it, because you have used this week's free withdrawal.`
                : ""}
            </p>
            <p className="mt-2">
              {data.needs_review
                ? "Our team checks it first — the first payment to a new bank account always is. It is sent once they approve it."
                : "It is sent now, and usually reaches your bank within minutes."}{" "}
              If the bank does not accept it, the money comes back to your balance.
            </p>
          </>
        }
        confirmLabel="Withdraw"
        onConfirm={confirm}
        pending={withdraw.isPending}
      />
    </Card>
  );
}
