"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Readout, Textarea, formatMoney } from "@vsolve/ui";
import { useState } from "react";
import type { Schemas } from "@vsolve/api-client";

import { maskId } from "@/features/shared/identifiers";
import {
  MAX_UNITS,
  STARTED_BY_LABEL,
  STARTED_BY_MEANING,
  STARTED_BY_TONE,
  paidForLabel,
  reasonLabel,
  type RefundStartedBy,
  RECONCILIATION_LABEL,
  RECONCILIATION_TONE,
  STATUS_LABEL,
  STATUS_MEANING,
  STATUS_TONE,
  isOutcomeUnknown,
  parseUnitIds,
  validateRefund,
  type RefundDraft,
} from "../model/refunds";
import {
  isInProgress,
  isKeyReused,
  isProviderUnavailable,
  isRefundRefused,
  isStepUpRequired,
  useReconcileRefund,
  useRequestRefund,
  useOperationsRefunds,
} from "../queries";

/**
 * Issuing a refund, and asking the provider what became of one.
 *
 * ## The console holds no refund it was not just handed
 *
 * There is no staff read of a refund in the contract, so everything on screen is the
 * response to the command that ran. That limitation is stated rather than
 * papered over: an empty panel labelled "Refunds" reads as "there are none
 * pending", which would be a claim about money made from no data at all.
 *
 * ## `202` is not "refunded"
 *
 * The created refund comes back as `REQUESTED`, before anything reaches the
 * provider. Every status gets its own sentence, and the ones that mean "we do
 * not know yet" say so — because the failure mode here is an operator telling a
 * Customer their money is on the way, and then a second operator issuing the
 * refund again.
 */

const EMPTY: RefundDraft = { orderId: "", unitIds: "", reasonCode: "" };

function RefundCard({
  refund,
  onReconcile,
  isReconciling,
  reconcileError,
}: {
  refund: Schemas["Refund"];
  onReconcile: () => void;
  isReconciling: boolean;
  reconcileError: unknown;
}) {
  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-text">This refund</h3>
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONE[refund.status]}>{STATUS_LABEL[refund.status]}</Badge>
          <Badge tone={RECONCILIATION_TONE[refund.reconciliation_state]}>
            {RECONCILIATION_LABEL[refund.reconciliation_state]}
          </Badge>
        </div>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        Reference <span data-numeric>{maskId(refund.id)}</span>
        {refund.provider_refund_id ? (
          <>
            {" · provider "}
            <span data-numeric>{refund.provider_refund_id}</span>
          </>
        ) : null}
      </p>

      <div className="mt-4">
        <Readout label="Amount" value={formatMoney(refund.amount.amount_paise)} size="sm" />
      </div>

      <p className="mt-4 max-w-prose text-sm leading-6 text-text-secondary">
        {STATUS_MEANING[refund.status]}
      </p>

      {refund.failure_code ? (
        <p className="mt-2 text-sm text-danger-text">
          Provider code <span data-numeric>{refund.failure_code}</span>
        </p>
      ) : null}

      {refund.allocations.length > 0 ? (
        <>
          <h4 className="mt-4 text-sm font-bold text-text">Per visit</h4>
          <ul className="mt-1 flex list-none flex-col gap-1 p-0 text-sm text-text-secondary">
            {refund.allocations.map((allocation) => (
              <li key={allocation.id}>
                <span data-numeric>{maskId(allocation.fulfilment_unit_id)}</span> —{" "}
                <span data-numeric>{formatMoney(allocation.amount.amount_paise)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {isOutcomeUnknown(refund) ? (
        <p className="mt-4 max-w-prose text-sm font-semibold text-warning-text">
          The outcome is not settled. Do not issue a second refund for these
          visits — reconcile this one to find out where it got to.
        </p>
      ) : null}

      {reconcileError ? (
        <ErrorState
          inline
          className="mt-4"
          severity={isProviderUnavailable(reconcileError) ? "warning" : "error"}
          title={
            isProviderUnavailable(reconcileError)
              ? "We could not reach the provider"
              : isStepUpRequired(reconcileError)
                ? "Confirm it is you again"
                : "We could not reconcile this refund"
          }
          message={
            isProviderUnavailable(reconcileError)
              ? "The refund is unchanged and nothing was sent. Try again shortly — do not issue another refund."
              : isStepUpRequired(reconcileError)
                ? "Your confirmation has lapsed. Confirm above and try again. The refund is unchanged."
                : "The refund is unchanged. Check your connection and try again."
          }
        />
      ) : null}

      <div className="mt-4">
        <Button
          variant="outline"
          onClick={onReconcile}
          loading={isReconciling}
          loadingLabel="Asking the provider"
        >
          Ask the provider what happened
        </Button>
      </div>
    </Card>
  );
}

export function RefundConsole({ onStepUpRequired }: { onStepUpRequired: (reason: string) => void }) {
  const [draft, setDraft] = useState<RefundDraft>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const create = useRequestRefund();
  const reconcile = useReconcileRefund();
  const refundsQuery = useOperationsRefunds();

  const allRefunds = refundsQuery.data?.pages.flatMap((page) => page.results) ?? [];
  const [startedBy, setStartedBy] = useState<RefundStartedBy | "ALL">("ALL");
  const [issuing, setIssuing] = useState(false);
  const shownRefunds =
    startedBy === "ALL" ? allRefunds : allRefunds.filter((r) => r.started_by === startedBy);
  const countBy = (who: RefundStartedBy) => allRefunds.filter((r) => r.started_by === who).length;

  const errors = validateRefund(draft);
  const units = parseUnitIds(draft.unitIds);

  // Whichever refund the console was last handed. Never read back from the
  // server, because there is no read.
  const refund = reconcile.data ?? create.data ?? null;

  function set<K extends keyof RefundDraft>(key: K, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setConfirming(false);
    if (create.isError || create.isSuccess) create.reset();
    reconcile.reset();
  }

  function raiseStepUp(error: unknown, what: string) {
    if (isStepUpRequired(error)) {
      onStepUpRequired(`Your confirmation lapsed before ${what}. Nothing was changed.`);
    }
  }

  return (
    <div>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-text">All refunds</h2>
            <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
              Every refund, including the ones the system started on its own after a
              cancellation. Reconcile asks Razorpay where a refund has got to.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refundsQuery.refetch()}
            loading={refundsQuery.isRefetching}
          >
            Refresh
          </Button>
        </div>

        {refundsQuery.isLoading ? (
          <p className="mt-4 text-sm text-text-secondary">Loading refunds...</p>
        ) : refundsQuery.isError ? (
          <ErrorState
            inline
            className="mt-4"
            title="Could not load refunds"
            message="Check your connection or session step-up status and try again."
          />
        ) : allRefunds.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">No refunds recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div role="group" aria-label="Show refunds started by" className="mb-3 flex flex-wrap gap-2">
              {(["ALL", "AUTOMATIC", "CUSTOMER", "OPERATIONS"] as const).map((who) => (
                <Button
                  key={who}
                  size="sm"
                  variant={startedBy === who ? "primary" : "outline"}
                  aria-pressed={startedBy === who}
                  onClick={() => setStartedBy(who)}
                >
                  {who === "ALL"
                    ? `All (${allRefunds.length})`
                    : `${STARTED_BY_LABEL[who]} (${countBy(who)})`}
                </Button>
              ))}
            </div>
            {shownRefunds.length === 0 ? (
              <p className="text-sm text-text-muted">
                None in the refunds loaded so far.
                {refundsQuery.hasNextPage ? " Load more to look further back." : ""}
              </p>
            ) : null}
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">For and why</th>
                  <th className="py-2 pr-3 font-semibold">Started by</th>
                  <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                  <th className="py-2 pr-3 font-semibold">Where it is</th>
                  <th className="py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {shownRefunds.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-surface-elevated/40">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-text-secondary" data-numeric>
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Kolkata",
                      }).format(new Date(r.created_at))}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="block font-semibold text-text">{paidForLabel(r.paid_for)}</span>
                      <span className="block text-text-secondary">{reasonLabel(r.reason_code)}</span>
                      <span className="block font-mono text-xs text-text-muted" data-numeric>
                        {r.order_id ? `Order ${maskId(r.order_id)} · ` : ""}Refund {maskId(r.id)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span title={STARTED_BY_MEANING[r.started_by]}>
                        <Badge tone={STARTED_BY_TONE[r.started_by]}>
                          {STARTED_BY_LABEL[r.started_by]}
                        </Badge>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-text" data-numeric>
                      {formatMoney(r.amount.amount_paise)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        {r.reconciliation_state !== "IN_SYNC" ? (
                          <Badge tone={RECONCILIATION_TONE[r.reconciliation_state]}>
                            {RECONCILIATION_LABEL[r.reconciliation_state]}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={reconcile.isPending && reconcile.variables === r.id}
                        onClick={() => {
                          reconcile.mutate(r.id, {
                            onError: (error) => raiseStepUp(error, "the provider was asked"),
                          });
                        }}
                      >
                        Reconcile
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {refundsQuery.hasNextPage ? (
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  loading={refundsQuery.isFetchingNextPage}
                  onClick={() => refundsQuery.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>
      <div className="mt-5 flex justify-end">
        <Button size="sm" variant={issuing ? "ghost" : "outline"} onClick={() => setIssuing((on) => !on)}>
          {issuing ? "Close" : "Refund several visits of one order…"}
        </Button>
      </div>
      {issuing ? (
        <>
        <Card className="mt-5 p-5">
          <h2 className="text-base font-bold text-text">Refund several visits on one Order</h2>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            To refund or cancel one visit, open it from Home services › Bookings — no ids needed.
            This form is for refunding several visits of one Order together. Refunds are per
            visit: Django works out how much is left on each one, and cannot refund more than was
            paid.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Order id" required error={submitted ? errors.orderId : undefined}>
              <Input
                value={draft.orderId}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => set("orderId", event.target.value)}
              />
            </Field>

            <Field
              label="Reason code"
              description="As Operations records it, for example service-not-delivered."
              required
              error={submitted ? errors.reasonCode : undefined}
            >
              <Input
                value={draft.reasonCode}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => set("reasonCode", event.target.value)}
              />
            </Field>
          </div>

          <Field
            className="mt-4"
            label="Fulfilment unit ids"
            description={`One id per line. Up to ${MAX_UNITS} visits in one refund.`}
            required
            error={submitted ? errors.unitIds : undefined}
          >
            <Textarea
              rows={4}
              value={draft.unitIds}
              spellCheck={false}
              onChange={(event) => set("unitIds", event.target.value)}
            />
          </Field>

          {!confirming ? (
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setSubmitted(true);
                if (Object.keys(errors).length === 0) setConfirming(true);
              }}
            >
              Review this refund
            </Button>
          ) : null}
        </Card>
        </>
      ) : null}

      {confirming ? (
        <Card className="mt-5 border-danger-line bg-danger-surface p-5">
          <h3 className="text-base font-bold text-danger-text">
            Confirm — this sends money back to a Customer
          </h3>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-text-muted">Order</dt>
            <dd className="text-text" data-numeric>
              {maskId(draft.orderId)}
            </dd>
            <dt className="text-text-muted">Visits</dt>
            <dd className="text-text" data-numeric>
              {units.length}
            </dd>
            <dt className="text-text-muted">Reason</dt>
            <dd className="text-text">{draft.reasonCode.trim()}</dd>
          </dl>

          <p className="mt-3 max-w-prose text-sm leading-6 text-text-secondary">
            Django refunds whatever is still refundable on those visits. There is
            no command in this console that takes a refund back.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="danger"
              loading={create.isPending}
              loadingLabel="Requesting the refund"
              onClick={() =>
                create.mutate(
                  {
                    orderId: draft.orderId,
                    fulfilmentUnitIds: units,
                    reasonCode: draft.reasonCode,
                  },
                  {
                    onSuccess: () => setConfirming(false),
                    onError: (error) => raiseStepUp(error, "the refund was requested"),
                  },
                )
              }
            >
              Request this refund
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Go back
            </Button>
          </div>
        </Card>
      ) : null}

      {create.isError ? (
        <ErrorState
          className="mt-5"
          severity={isInProgress(create.error) ? "warning" : "error"}
          title={
            isStepUpRequired(create.error)
              ? "Confirm it is you again"
              : isInProgress(create.error)
                ? "This refund is still being processed"
                : isKeyReused(create.error)
                  ? "Those details do not match the earlier attempt"
                  : isRefundRefused(create.error)
                    ? "This refund was not accepted"
                    : "We could not request the refund"
          }
          message={
            isStepUpRequired(create.error)
              ? "Your confirmation lapsed. Confirm above and try again. Nothing was refunded."
              : isInProgress(create.error)
                ? "An identical request has not finished. Wait rather than sending it again — a second refund would be a second payment."
                : isKeyReused(create.error)
                  ? "An earlier refund for this Order and these visits used different details. Find out what already exists before sending this again."
                  : isRefundRefused(create.error)
                    ? `${(create.error as Error).message} Nothing was refunded.`
                    : "Nothing was refunded. Check your connection and try again."
          }
        />
      ) : null}

      {refund ? (
        <RefundCard
          refund={refund}
          isReconciling={reconcile.isPending}
          reconcileError={reconcile.error}
          onReconcile={() =>
            reconcile.mutate(refund.id, {
              onError: (error) => raiseStepUp(error, "the provider was asked"),
            })
          }
        />
      ) : null}

    </div>
  );
}
