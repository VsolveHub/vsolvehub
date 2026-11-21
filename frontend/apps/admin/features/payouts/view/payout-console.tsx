"use client";

import { useCurrentSession } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  Spinner,
  formatMoney,
} from "@vsolve/ui";
import { useState } from "react";

import { getApiClient } from "@/lib/api/browser";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

import {
  isStepUpRequired,
  useApprovePayoutBatch,
  useCancelPayoutBatch,
  usePayPayoutBatch,
  usePayoutBatch,
  usePayoutBatches,
  type PayoutBatch,
} from "../queries";
import { NewPayoutRun } from "./new-payout-run";
import {
  AuditHistory,
  RunReviewDialog,
  skipReasonLabel,
  type RunAction,
} from "./payout-review";

/**
 * Payout runs.
 *
 * ## One person can run it, after a review
 *
 * The proposer may approve their own run (recorded as "approved by the proposer" in its history).
 * Approve and Pay open a review of exactly what will happen, from the server's preview, and
 * Cancel says what returns to whom. Nothing changes until the operator confirms.
 *
 * ## A missing step-up is routed, not reported as an error
 *
 * `approve` and `pay` answer `401 step_up_required` when the session has not re-verified
 * recently. That is the control working. Showing it as a generic failure would leave an operator
 * pressing a button that keeps not working; naming it tells them what to do.
 *
 * ## Nothing here claims money moved
 *
 * `pay` starts the run. Items settle asynchronously through the provider and the reconciliation
 * sweep, so this renders the item states the server reports and never a total that implies
 * completion. `UNDER_REVIEW` is shown as its own state because that is exactly what it is —
 * a payout we do not yet know the outcome of.
 */

const BATCH_TONE: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  PAYING: "info",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

const ITEM_TONE: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  RESERVED: "neutral",
  SUBMITTED: "info",
  PAID: "success",
  FAILED: "danger",
  UNDER_REVIEW: "warning",
  RELEASED: "neutral",
};

function StepUpNotice() {
  return (
    <div className="mt-3 rounded-control border border-warning-line bg-warning-surface p-3 text-sm">
      <p className="font-semibold text-warning-text">Re-verify to continue</p>
      <p className="mt-1 text-warning-text">
        Releasing money needs a fresh code on your session. Verify your
        identity, then try again.
      </p>
    </div>
  );
}

function BatchDetail({ batchId }: { batchId: string }) {
  const detail = usePayoutBatch(batchId);
  const session = useCurrentSession(getApiClient());
  const approve = useApprovePayoutBatch();
  const pay = usePayPayoutBatch();
  const cancel = useCancelPayoutBatch();
  const [reviewing, setReviewing] = useState<RunAction | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (detail.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Loading this run…
      </Card>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        title="We could not load this payout run"
        message="Nothing has changed. Try again."
        actionLabel="Try again"
        onAction={() => void detail.refetch()}
      />
    );
  }

  const batch: PayoutBatch = detail.data;
  const versioned = { batchId: batch.id, expectedVersion: batch.version };
  const currentUserId = session.data?.user?.id ?? null;
  const isOwnProposal =
    currentUserId !== null && currentUserId === batch.proposed_by_id;
  const needsStepUp =
    isStepUpRequired(approve.error) ||
    isStepUpRequired(pay.error) ||
    isStepUpRequired(cancel.error);
  const command = reviewing === "pay" ? pay : approve;
  const reservedTotal = batch.items
    .filter((item) => item.status === "RESERVED")
    .reduce((sum, item) => sum + item.amount_paise, 0);
  const reservedCount = batch.items.filter(
    (item) => item.status === "RESERVED",
  ).length;

  function openReview(action: RunAction) {
    approve.reset();
    pay.reset();
    setReviewing(action);
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone={BATCH_TONE[batch.status] ?? "neutral"}>
            {batch.status.replaceAll("_", " ").toLowerCase()}
          </Badge>
          <h2 className="mt-2 text-lg font-bold text-text">
            {batch.reference}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {batch.item_count} {batch.item_count === 1 ? "payout" : "payouts"} ·{" "}
            <span data-numeric>{formatMoney(batch.total_paise)}</span>
          </p>
        </div>
      </div>

      {needsStepUp ? <StepUpNotice /> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {batch.status === "PENDING_APPROVAL" ? (
          <Button onClick={() => openReview("approve")}>
            Review and approve…
          </Button>
        ) : null}

        {batch.status === "APPROVED" ? (
          <Button onClick={() => openReview("pay")}>Review and pay…</Button>
        ) : null}

        {["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(batch.status) ? (
          <Button
            variant="outline"
            onClick={() => {
              cancel.reset();
              setConfirmingCancel(true);
            }}
          >
            Cancel run…
          </Button>
        ) : null}

        {batch.status === "APPROVED" ? (
          <>
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  `${PUBLIC_API_BASE_URL}/api/v1/operations/payout-batches/${batch.id}/bank-export.csv`,
                  "_blank",
                )
              }
            >
              Export Bank CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  `${PUBLIC_API_BASE_URL}/api/v1/operations/payout-batches/${batch.id}/bank-export.xlsx`,
                  "_blank",
                )
              }
            >
              Export Bank Excel
            </Button>
          </>
        ) : null}
      </div>

      <section aria-labelledby="batch-items" className="mt-6">
        <h3 id="batch-items" className="text-sm font-semibold text-text">
          Payouts in this run
        </h3>
        <ul className="mt-2 list-none space-y-2 text-sm">
          {batch.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3"
            >
              <span className="flex items-center gap-2">
                <Badge tone={ITEM_TONE[item.status] ?? "neutral"}>
                  {item.status.replaceAll("_", " ").toLowerCase()}
                </Badge>
                {item.failure_code ? (
                  <span className="text-text-secondary">
                    {skipReasonLabel(item.failure_code)}
                  </span>
                ) : null}
              </span>
              <span data-numeric className="text-text">
                {formatMoney(item.amount_paise)}
              </span>
            </li>
          ))}
        </ul>
        {batch.items.some((item) => item.status === "UNDER_REVIEW") ? (
          <p className="mt-3 rounded-control bg-warning-surface p-3 text-sm text-warning-text">
            Some payouts have an unknown outcome. They are not retried
            automatically — the money may already have gone out. Finance
            reconciles these.
          </p>
        ) : null}
      </section>

      <AuditHistory events={batch.history} />

      {reviewing !== null ? (
        <RunReviewDialog
          batch={batch}
          action={reviewing}
          isOwnProposal={isOwnProposal}
          pending={command.isPending}
          error={command.error}
          onClose={() => setReviewing(null)}
          onConfirm={(expectedVersion) =>
            command.mutate(
              { batchId: batch.id, expectedVersion },
              {
                onSuccess: () => setReviewing(null),
                onError: (error) => {
                  if (isStepUpRequired(error)) setReviewing(null);
                },
              },
            )
          }
        />
      ) : null}

      {confirmingCancel ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !cancel.isPending) setConfirmingCancel(false);
          }}
          title="Cancel this run?"
          description={
            reservedCount > 0
              ? `${formatMoney(reservedTotal)} goes back to ${reservedCount} ${
                  reservedCount === 1
                    ? "partner's balance"
                    : "partners' balances"
                }. Nothing is sent. This can't be undone; propose a new run to pay them.`
              : "Nothing is reserved in this run. It will be closed and nothing is sent."
          }
          footer={
            <>
              <Button
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => setConfirmingCancel(false)}
              >
                Keep the run
              </Button>
              <Button
                variant="danger"
                loading={cancel.isPending}
                loadingLabel="Cancelling"
                onClick={() =>
                  cancel.mutate(versioned, {
                    onSuccess: () => setConfirmingCancel(false),
                    onError: (error) => {
                      if (isStepUpRequired(error)) setConfirmingCancel(false);
                    },
                  })
                }
              >
                Cancel run
              </Button>
            </>
          }
        >
          {cancel.isError && !isStepUpRequired(cancel.error) ? (
            <ErrorState
              inline
              title="The run was not cancelled"
              message="It may have changed or started paying. Close this and check the run again."
            />
          ) : (
            <span />
          )}
        </Dialog>
      ) : null}
    </Card>
  );
}

export function PayoutConsole() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const batches = usePayoutBatches({ kind: "RUN" });
  const rows = batches.data?.pages.flatMap((page) => page.results) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <NewPayoutRun onProposed={setSelectedId} />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div>
          {batches.isPending ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Spinner size="sm" />
              Loading runs…
            </p>
          ) : null}

          {!batches.isPending && rows.length === 0 ? (
            <p className="text-sm text-text-secondary">No payout runs yet.</p>
          ) : null}

          <ul className="list-none space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  aria-current={selectedId === row.id ? "true" : undefined}
                  className={[
                    "w-full rounded-card border p-3 text-left text-sm",
                    selectedId === row.id
                      ? "border-signal-300 bg-selected-surface"
                      : "border-line bg-surface hover:bg-surface-hover",
                  ].join(" ")}
                >
                  <Badge tone={BATCH_TONE[row.status] ?? "neutral"}>
                    {row.status.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                  <span className="mt-1 block font-semibold text-text">
                    {row.reference}
                  </span>
                  <span data-numeric className="text-text-secondary">
                    {formatMoney(row.total_paise)} · {row.item_count}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {batches.hasNextPage ? (
            <Button
              className="mt-3"
              variant="outline"
              loading={batches.isFetchingNextPage}
              loadingLabel="Loading"
              onClick={() => void batches.fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </div>

        {selectedId === null ? (
          <Card className="p-6 text-sm text-text-secondary">
            Choose a payout run to review and approve it.
          </Card>
        ) : (
          <BatchDetail batchId={selectedId} />
        )}
      </div>
    </div>
  );
}
