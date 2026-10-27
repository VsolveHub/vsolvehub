"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  Field,
  Select,
  Textarea,
  formatDateTime,
  formatMoney,
} from "@vsolve/ui";
import { useState } from "react";

import {
  isSelfApproval,
  isStepUpRequired,
  useApproveWithdrawal,
  useDeclineWithdrawal,
  useWithdrawals,
  type OperationsWithdrawal,
  type WithdrawalQueueStatus,
} from "../queries";

/**
 * Partner withdrawals the rules did not send on their own.
 *
 * Two reasons put one here, both shown on the row: the first payout to a bank account (cooling
 * bought time to notice a takeover; this is a person looking), and a balance above the
 * withdrawal maximum (full balance only, so it cannot be split). Everything else is approved by
 * policy and sent without anyone here.
 *
 * Approve needs a fresh step-up — money leaves on it. Decline does not: it only puts the money
 * back in the Partner's balance, and the reason typed is what the Partner reads.
 */

const REVIEW_REASON: Record<string, string> = {
  first_payout_to_account: "First payout to this bank account",
  over_maximum: "Balance is above the withdrawal maximum",
};

const STATUS_LABEL: Record<WithdrawalQueueStatus, string> = {
  PENDING_APPROVAL: "Waiting for review",
  PAYING: "Sending",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Declined",
};

const STATUS_TONE: Record<WithdrawalQueueStatus, "warning" | "info" | "success" | "danger" | "neutral"> =
  {
    PENDING_APPROVAL: "warning",
    PAYING: "info",
    PAID: "success",
    FAILED: "danger",
    CANCELLED: "neutral",
  };

function WithdrawalRow({
  withdrawal,
  onStepUpRequired,
}: {
  withdrawal: OperationsWithdrawal;
  onStepUpRequired: (reason: string) => void;
}) {
  const approve = useApproveWithdrawal();
  const decline = useDeclineWithdrawal();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const transfer = withdrawal.transfer;
  const status = withdrawal.status as WithdrawalQueueStatus;
  const waiting = status === "PENDING_APPROVAL";
  const busy = approve.isPending || decline.isPending;
  const error = approve.error ?? decline.error;

  function onError(failure: unknown) {
    if (isStepUpRequired(failure)) {
      onStepUpRequired("Your confirmation lapsed. The withdrawal was not approved.");
    }
  }

  return (
    <li className="flex flex-col gap-3 bg-surface px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">
            {transfer?.partner_display_name ?? "Unknown partner"}
          </p>
          {transfer ? (
            <p data-numeric className="text-xs text-text-secondary">
              {transfer.partner_phone_number}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>
          {transfer ? (
            <p data-numeric className="mt-1 text-lg font-bold text-text">
              {formatMoney(transfer.amount_paise)}
            </p>
          ) : null}
        </div>
      </div>

      {withdrawal.review_reasons.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-2">
          {withdrawal.review_reasons.map((code) => (
            <li key={code}>
              <Badge tone="warning">{REVIEW_REASON[code] ?? code}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {transfer ? (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-text-muted">Name on the bank account</dt>
            <dd className="font-medium text-text">{transfer.account_holder_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Account</dt>
            <dd data-numeric className="font-medium text-text">
              ••••{transfer.account_last4} · {transfer.account_ifsc}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Account added</dt>
            <dd className="text-text">{formatDateTime(transfer.account_added_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Requested</dt>
            <dd className="text-text">{formatDateTime(withdrawal.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Balance taken</dt>
            <dd data-numeric className="text-text">
              {formatMoney(transfer.balance_paise)}
              {transfer.fee_paise > 0 ? ` (fee ${formatMoney(transfer.fee_paise)})` : ""}
            </dd>
          </div>
          {transfer.utr ? (
            <div>
              <dt className="text-xs text-text-muted">Bank reference (UTR)</dt>
              <dd data-numeric className="text-text">
                {transfer.utr}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {withdrawal.review_note ? (
        <p className="text-sm text-text-secondary">Declined: {withdrawal.review_note}</p>
      ) : null}
      {transfer?.failure_code && status !== "CANCELLED" ? (
        <p className="text-xs text-danger-text">Failure: {transfer.failure_code}</p>
      ) : null}

      {waiting ? (
        <div className="flex flex-col gap-2">
          {declining ? (
            <Field label="Why it was declined (the partner sees this)" required>
              <Textarea
                value={reason}
                maxLength={240}
                placeholder="For example: please call support to confirm this bank account."
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {declining ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={reason.trim().length < 3}
                  loading={decline.isPending}
                  onClick={() =>
                    decline.mutate({
                      batchId: withdrawal.id,
                      expectedVersion: withdrawal.version,
                      reason: reason.trim(),
                    })
                  }
                >
                  Decline withdrawal
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeclining(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  loading={approve.isPending}
                  disabled={busy}
                  onClick={() =>
                    approve.mutate(
                      { batchId: withdrawal.id, expectedVersion: withdrawal.version },
                      { onError },
                    )
                  }
                >
                  Approve and send
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setDeclining(true)}>
                  Decline…
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {error && !isStepUpRequired(error) ? (
        <p role="alert" className="text-sm text-danger-text">
          {isSelfApproval(error)
            ? "You requested this withdrawal yourself, so a colleague has to approve it."
            : friendlyErrorMessage(error)}
        </p>
      ) : null}
    </li>
  );
}

export function WithdrawalQueue({ onStepUpRequired }: { onStepUpRequired: (reason: string) => void }) {
  const [status, setStatus] = useState<WithdrawalQueueStatus>("PENDING_APPROVAL");
  const withdrawals = useWithdrawals(status);
  const rows = withdrawals.data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Partner withdrawals</h2>
          <p className="mt-1 max-w-prose text-sm text-text-secondary">
            Withdrawals land here when the rules need a person: the first payout to a bank
            account, or a balance above the maximum. Check the name and account against the
            partner, then approve to send. The rest are sent automatically.
          </p>
        </div>
        <Field label="Show">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as WithdrawalQueueStatus)}
          >
            <option value="PENDING_APPROVAL">Waiting for review</option>
            <option value="PAYING">Sending</option>
            <option value="PAID">Paid</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Declined</option>
          </Select>
        </Field>
      </div>

      {withdrawals.isPending ? (
        <p className="mt-4 text-sm text-text-secondary">Loading withdrawals…</p>
      ) : withdrawals.isError ? (
        <p role="alert" className="mt-4 text-sm text-danger-text">
          {friendlyErrorMessage(withdrawals.error)}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">
          {status === "PENDING_APPROVAL" ? "No withdrawals are waiting for review." : "Nothing to show."}
        </p>
      ) : (
        <ul className="mt-4 list-none divide-y divide-line overflow-hidden rounded-card border border-line">
          {rows.map((withdrawal) => (
            <WithdrawalRow
              key={withdrawal.id}
              withdrawal={withdrawal}
              onStepUpRequired={onStepUpRequired}
            />
          ))}
        </ul>
      )}

      {withdrawals.hasNextPage ? (
        <Button
          className="mt-3"
          size="sm"
          variant="ghost"
          loading={withdrawals.isFetchingNextPage}
          onClick={() => void withdrawals.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </Card>
  );
}
