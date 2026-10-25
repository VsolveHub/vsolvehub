"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Field, Select, Textarea, formatDate, formatDateTime } from "@vsolve/ui";
import { useState } from "react";

import {
  isSelfReview,
  isStepUpRequired,
  usePayoutAccounts,
  useReviewPayoutAccount,
  type OperationsPayoutAccount,
  type PayoutAccountStatus,
} from "../queries";

const STATUS_TONE: Record<PayoutAccountStatus, "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
  REPLACED: "neutral",
};

const STATUS_LABEL: Record<PayoutAccountStatus, string> = {
  PENDING: "Waiting for review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  REPLACED: "Replaced",
};

function AccountRow({
  account,
  onStepUpRequired,
}: {
  account: OperationsPayoutAccount;
  onStepUpRequired: (reason: string) => void;
}) {
  const review = useReviewPayoutAccount();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const status = account.status as PayoutAccountStatus;

  function onError(error: unknown) {
    if (isStepUpRequired(error)) {
      onStepUpRequired("Your confirmation lapsed. The account was not changed.");
    }
  }

  return (
    <li className="flex flex-col gap-3 bg-surface px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{account.partner_display_name}</p>
          <p data-numeric className="text-xs text-text-secondary">
            {account.partner_phone_number}
          </p>
        </div>
        <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? account.status}</Badge>
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-text-muted">Name on the bank account</dt>
          <dd className="font-medium text-text">{account.holder_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Account</dt>
          <dd data-numeric className="font-medium text-text">
            ••••{account.account_last4} · {account.ifsc}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Added</dt>
          <dd className="text-text">{formatDateTime(account.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Payable from (cooling)</dt>
          <dd className="text-text">{formatDate(account.effective_from)}</dd>
        </div>
      </dl>

      {account.rejection_reason ? (
        <p className="text-sm text-danger-text">Rejected: {account.rejection_reason}</p>
      ) : null}
      {!account.is_registered_with_provider ? (
        <p className="rounded-plate bg-warning-surface px-3 py-2 text-xs text-warning-text">
          This account was never registered with the payout provider, so it cannot be verified.
          Ask the partner to enter their bank details again.
        </p>
      ) : null}

      {status === "PENDING" ? (
        <div className="flex flex-col gap-2">
          {rejecting ? (
            <Field label="Why it was rejected (the partner sees this)" required>
              <Textarea
                value={reason}
                maxLength={240}
                placeholder="For example: the name does not match the partner's ID."
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {rejecting ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={reason.trim().length < 3}
                  loading={review.isPending}
                  onClick={() =>
                    review.mutate(
                      { accountId: account.id, decision: "reject", reason: reason.trim() },
                      { onError },
                    )
                  }
                >
                  Reject account
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  disabled={!account.is_registered_with_provider}
                  loading={review.isPending}
                  onClick={() => review.mutate({ accountId: account.id, decision: "verify" }, { onError })}
                >
                  Verify account
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRejecting(true)}>
                  Reject…
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {review.isError && !isStepUpRequired(review.error) ? (
        <p role="alert" className="text-sm text-danger-text">
          {isSelfReview(review.error)
            ? "You added this account, so a colleague has to review it."
            : friendlyErrorMessage(review.error)}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Where partners' money goes. Nothing is paid into an account until someone here verifies it
 * and its 24-hour cooling period has passed, and nobody reviews an account they added.
 */
export function PayoutAccountReview({ onStepUpRequired }: { onStepUpRequired: (reason: string) => void }) {
  const [status, setStatus] = useState<PayoutAccountStatus>("PENDING");
  const accounts = usePayoutAccounts(status);
  const rows = accounts.data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text">Partner bank accounts</h2>
          <p className="mt-1 max-w-prose text-sm text-text-secondary">
            Check the name on each account against the partner before verifying it. Payouts
            start once an account is verified and its 24-hour cooling period has passed.
          </p>
        </div>
        <Field label="Show">
          <Select value={status} onChange={(event) => setStatus(event.target.value as PayoutAccountStatus)}>
            <option value="PENDING">Waiting for review</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
            <option value="REPLACED">Replaced</option>
          </Select>
        </Field>
      </div>

      {accounts.isPending ? (
        <p className="mt-4 text-sm text-text-secondary">Loading accounts…</p>
      ) : accounts.isError ? (
        <p role="alert" className="mt-4 text-sm text-danger-text">
          {friendlyErrorMessage(accounts.error)}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">
          {status === "PENDING" ? "No accounts are waiting for review." : "Nothing to show."}
        </p>
      ) : (
        <ul className="mt-4 list-none divide-y divide-line overflow-hidden rounded-card border border-line">
          {rows.map((account) => (
            <AccountRow key={account.id} account={account} onStepUpRequired={onStepUpRequired} />
          ))}
        </ul>
      )}

      {accounts.hasNextPage ? (
        <Button
          className="mt-3"
          size="sm"
          variant="ghost"
          loading={accounts.isFetchingNextPage}
          onClick={() => void accounts.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </Card>
  );
}
