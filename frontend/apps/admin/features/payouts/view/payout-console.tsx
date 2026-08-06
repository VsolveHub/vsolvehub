"use client";

import { useCurrentSession } from "@vsolve/query";
import { Badge, Button, Card, ErrorState, Spinner, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { getApiClient } from "@/lib/api/browser";

import {
  isSelfApproval,
  isStepUpRequired,
  useApprovePayoutBatch,
  useCancelPayoutBatch,
  usePayPayoutBatch,
  usePayoutBatch,
  usePayoutBatches,
  type PayoutBatch,
} from "../queries";

/**
 * Payout runs.
 *
 * ## Approve is hidden from the person who proposed
 *
 * `proposed_by_id` is published, so the console can grey out Approve for its own proposer rather
 * than offer a button that returns `403 self_approval_denied`. The server refuses it either way —
 * this is about not wasting somebody's time, not about enforcement.
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

const BATCH_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  PAYING: "info",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

const ITEM_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
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
        Releasing money needs a fresh code on your session. Verify your identity, then try again.
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
  const isOwnProposal = currentUserId !== null && currentUserId === batch.proposed_by_id;
  const needsStepUp =
    isStepUpRequired(approve.error) || isStepUpRequired(pay.error);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone={BATCH_TONE[batch.status] ?? "neutral"}>
            {batch.status.replaceAll("_", " ").toLowerCase()}
          </Badge>
          <h2 className="mt-2 text-lg font-bold text-text">{batch.reference}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {batch.item_count} {batch.item_count === 1 ? "payout" : "payouts"} ·{" "}
            <span data-numeric>{formatMoney(batch.total_paise)}</span>
          </p>
        </div>
      </div>

      {needsStepUp ? <StepUpNotice /> : null}

      {isSelfApproval(approve.error) ? (
        <ErrorState
          inline
          className="mt-3"
          title="You proposed this run"
          message="A payout run has to be approved by somebody else. Ask a colleague to review it."
        />
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {batch.status === "PENDING_APPROVAL" ? (
          <>
            <Button
              disabled={isOwnProposal || approve.isPending}
              loading={approve.isPending}
              loadingLabel="Approving"
              onClick={() => approve.mutate(versioned)}
            >
              Approve this run
            </Button>
            {isOwnProposal ? (
              <p className="self-center text-sm text-text-secondary">
                You proposed this run, so somebody else has to approve it.
              </p>
            ) : null}
          </>
        ) : null}

        {batch.status === "APPROVED" ? (
          <Button
            loading={pay.isPending}
            loadingLabel="Starting"
            onClick={() => pay.mutate(versioned)}
          >
            Start paying
          </Button>
        ) : null}

        {["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(batch.status) ? (
          <Button
            variant="outline"
            loading={cancel.isPending}
            loadingLabel="Cancelling"
            onClick={() => cancel.mutate(versioned)}
          >
            Cancel run
          </Button>
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
                  <span className="text-text-secondary">{item.failure_code}</span>
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
            Some payouts have an unknown outcome. They are not retried automatically — the money
            may already have gone out. Finance reconciles these.
          </p>
        ) : null}
      </section>
    </Card>
  );
}

export function PayoutConsole() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const batches = usePayoutBatches();
  const rows = batches.data?.pages.flatMap((page) => page.results) ?? [];

  return (
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
                <span className="mt-1 block font-semibold text-text">{row.reference}</span>
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
  );
}
