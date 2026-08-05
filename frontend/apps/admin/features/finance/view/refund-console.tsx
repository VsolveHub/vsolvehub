"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Readout, Textarea, formatMoney } from "@vsolve/ui";
import { useState } from "react";
import type { Schemas } from "@vsolve/api-client";

import { maskId } from "@/features/shared/identifiers";
import {
  MAX_UNITS,
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
} from "../queries";

/**
 * Issuing a refund, and asking the provider what became of one.
 *
 * ## The console holds no refund it was not just handed
 *
 * There is no Finance read in the contract, so everything on screen is the
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
  const [lookupId, setLookupId] = useState("");

  const create = useRequestRefund();
  const reconcile = useReconcileRefund();

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
        <h2 className="text-base font-bold text-text">Refund visits on an Order</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Refunds are per visit. Django works out how much is left to refund on
          each one — this console does not choose an amount, and cannot refund
          more than was paid.
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
            description="As Finance records it, for example service-not-delivered."
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

      <Card className="mt-5 p-5">
        <h2 className="text-base font-bold text-text">Reconcile a refund by id</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          There is no Finance list of refunds and no Finance lookup — the only
          published read is the Customer&apos;s own. So a refund from a previous
          session is reached by id, from the case you are working, and
          reconciling it is what shows you where it got to.
        </p>

        <div className="mt-4 max-w-sm">
          <Field label="Refund id" required>
            <Input
              value={lookupId}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setLookupId(event.target.value);
                reconcile.reset();
              }}
            />
          </Field>
        </div>

        <Button
          className="mt-4"
          variant="outline"
          loading={reconcile.isPending}
          loadingLabel="Asking the provider"
          onClick={() =>
            reconcile.mutate(lookupId, {
              onError: (error) => raiseStepUp(error, "the provider was asked"),
            })
          }
        >
          Reconcile this refund
        </Button>
      </Card>
    </div>
  );
}
