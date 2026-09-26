"use client";

import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Spinner,
  formatMoney,
} from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { useCaseQueueSummary } from "@/features/cases/queries";
import { isUuid, maskId } from "@/features/shared/identifiers";
import { useReconciliationSummary, useRecordChargeback, useRequestTimeline } from "../queries";
import { formatMoment, humanise } from "../model/cases";
import {
  EMPTY_CHARGEBACK,
  bookingFeeReading,
  chargebackAmountPaise,
  detailPaise,
  detailString,
  exceptionCopy,
  isMoneyEvent,
  moneyEventLabel,
  problemFor,
  reconciliationIsClear,
  validateChargeback,
  type ChargebackDraft,
} from "../model/money";

/**
 * Refund and payout states, read from the ledger-backed reads and never derived (`M2-FE-708`).
 *
 * ## Nothing on this screen is arithmetic
 *
 * Every figure is a server-sent integer paise formatted once, or a server-sent count printed as
 * it arrived. There is no subtotal, no "amount less refunds", no netting of a forfeit split
 * against a fee. A refund figure a client computes is a figure that can disagree with a
 * statement, and a disagreement about money between two screens is how a support call becomes a
 * dispute.
 *
 * ## Three reads, three different questions, deliberately not merged
 *
 * `GET /operations/reconciliation/` answers *what is outstanding across the business*. The case
 * queue summary answers *how much money is frozen behind an open claim*. The request timeline
 * answers *what happened to the money on this one request*. Merging them into a single "money"
 * number would produce a figure with no owner and no statement behind it.
 *
 * ## There is still no staff read of an individual refund
 *
 * `GET /refunds/{id}/` is scoped to the Customer who owns the order. Contract 1.32.0 added the
 * aggregate, not the record. Inspecting one refund still runs through Refunds, where asking the
 * provider is a step-up-gated command rather than a read — and that limitation is stated here
 * rather than papered over with an empty panel that reads as "there are none".
 */

/* ---------------------------------------------------------------------------
   What is outstanding
   --------------------------------------------------------------------------- */

function ReconciliationPanel() {
  const summary = useReconciliationSummary();

  if (summary.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Reading what is outstanding…
      </Card>
    );
  }

  if (summary.isError || !summary.data) {
    return (
      <ErrorState
        title="We could not read the reconciliation summary"
        message="Nothing has changed, and nothing here should be assumed clear. Try again."
        actionLabel="Try again"
        onAction={() => void summary.refetch()}
      />
    );
  }

  const data = summary.data;

  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-text">What Finance is carrying</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Counted server-side as at {formatMoment(data.server_now)}. The sweep behind these numbers
        never corrects what it finds — a job that could fix a mismatch would quietly rewrite
        history when its own arithmetic was wrong, and the first sign of trouble would be a ledger
        that always balanced.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-control border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Refunds the provider has not settled
          </p>
          <p data-numeric className="mt-1 text-2xl font-bold text-text">
            {data.refunds_awaiting_provider}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Sent and unconfirmed. The Customer has not been paid back yet, and must not be told
            they have.
          </p>
        </div>
        <div className="rounded-control border border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Refunds the provider refused
          </p>
          <p
            data-numeric
            className={[
              "mt-1 text-2xl font-bold",
              data.failed_refunds > 0 ? "text-danger-text" : "text-text",
            ].join(" ")}
          >
            {data.failed_refunds}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Nothing was returned. Each of these is somebody waiting for money that is not coming
            without a person.
          </p>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-text">Open financial exceptions</h3>
      {data.open_by_kind.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">
          {reconciliationIsClear(data)
            ? "Nothing outstanding. This is a real zero from the server, not an empty panel."
            : "No exceptions by kind, though other counts above are not zero."}
        </p>
      ) : (
        <ul className="mt-2 list-none space-y-2 p-0">
          {data.open_by_kind.map((row) => {
            const copy = exceptionCopy(row.kind);
            return (
              <li key={row.kind} className="rounded-control border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text">{copy.label}</span>
                  <Badge tone={copy.tone === "info" ? "info" : copy.tone}>{row.count}</Badge>
                </div>
                <p className="mt-1 text-sm text-text-secondary">{copy.meaning}</p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-sm text-text-secondary">
        To inspect one refund and ask the provider what became of it, use{" "}
        <Link href="/finance" className="text-text-link hover:underline">
          Refunds
        </Link>
        . There is no staff read of a single refund in the contract — that surface holds only the
        refund it was just handed.
      </p>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Frozen money
   --------------------------------------------------------------------------- */

function PayoutHoldPanel() {
  const summary = useCaseQueueSummary();

  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-text">Payout held behind an open claim</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Nine case kinds hold payout, and the rule they encode is not &ldquo;money is
        involved&rdquo; — it is that somebody has said the work did not happen as recorded. The
        hold is the case: it lifts when the case closes, and it comes back if an appeal is
        overturned.
      </p>
      {summary.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Counting…
        </p>
      ) : summary.data ? (
        <>
          <p data-numeric className="mt-3 text-3xl font-bold text-text">
            {summary.data.holding_payout}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            open {summary.data.holding_payout === 1 ? "case is" : "cases are"} holding money right
            now.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-warning-text">
          The count could not be read. Do not treat that as zero.
        </p>
      )}
      <Link
        href="/operations/cases"
        className="mt-4 inline-block text-sm font-semibold text-text-link hover:underline"
      >
        Work the case queue
      </Link>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   The money on one request
   --------------------------------------------------------------------------- */

function MoneyEventCard({
  type,
  at,
  detail,
}: {
  type: string;
  at: string;
  detail: Record<string, unknown>;
}) {
  const status = detailString(detail, "status");
  const amount = detailPaise(detail, "amount_paise");
  const isBookingFee = type === "BOOKING_FEE";
  const reading = isBookingFee && status !== null ? bookingFeeReading(status) : null;

  return (
    <li className="rounded-control border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">{moneyEventLabel(type)}</span>
        <span className="text-xs text-text-muted">{formatMoment(at)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {reading ? (
          <Badge tone={reading.tone === "info" ? "info" : reading.tone}>{reading.label}</Badge>
        ) : status !== null ? (
          <Badge tone="neutral">{humanise(status)}</Badge>
        ) : null}
      </div>

      {reading ? (
        <p className="mt-2 text-sm leading-6 text-text-secondary">{reading.meaning}</p>
      ) : null}

      {amount === null ? null : reading !== null && !reading.collected ? (
        // The `WAIVED` trap, and the four other booking-fee states where an amount exists and
        // nothing was collected. The number is shown as what it is — the published fee — and
        // explicitly not as money anybody paid.
        <p className="mt-2 text-sm text-text">
          Published amount <strong>{formatMoney(amount)}</strong>
          <span className="text-text-secondary"> — not collected.</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-text">
          <strong>{formatMoney(amount)}</strong>
        </p>
      )}

      <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
        {(
          [
            ["travel_compensation_paise", "Travel compensation to the lead"],
            ["platform_share_paise", "Platform share"],
            ["vendor_payout_paise", "Vendor visit payout"],
          ] as const
        ).map(([key, label]) => {
          const value = detailPaise(detail, key);
          if (value === null) return null;
          return (
            <div key={key} className="contents">
              <dt className="font-semibold text-text-secondary">{label}</dt>
              <dd className="m-0 text-text-secondary">{formatMoney(value)}</dd>
            </div>
          );
        })}
        {detailString(detail, "settlement_reason_code") ? (
          <div className="contents">
            <dt className="font-semibold text-text-secondary">Settlement reason</dt>
            <dd className="m-0 text-text-secondary">
              {humanise(detailString(detail, "settlement_reason_code") ?? "")}
            </dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

function RequestMoneyPanel() {
  const [typed, setTyped] = useState("");
  const [requirementId, setRequirementId] = useState<string | null>(null);
  const timeline = useRequestTimeline(requirementId);

  const shapeProblem =
    typed.trim() !== "" && !isUuid(typed) ? "That is not the shape of a request id." : undefined;

  const moneyEvents = timeline.data?.events.filter(isMoneyEvent) ?? [];
  const otherCount = (timeline.data?.events.length ?? 0) - moneyEvents.length;

  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-text">The money on one request</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        The contract publishes no Operations search over requests, so this takes the id from the
        case you are working rather than offering a picker backed by nothing.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Request id" error={shapeProblem} className="min-w-[22rem] flex-1">
          <Input value={typed} onChange={(event) => setTyped(event.target.value)} />
        </Field>
        <Button
          className="mb-1"
          disabled={!isUuid(typed)}
          onClick={() => setRequirementId(typed.trim())}
        >
          Read it
        </Button>
      </div>

      {requirementId === null ? null : timeline.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Reading {maskId(requirementId)}…
        </p>
      ) : timeline.isError || !timeline.data ? (
        <ErrorState
          inline
          className="mt-4"
          title="We could not read that request"
          message="It may not exist. Nothing has changed."
          actionLabel="Try again"
          onAction={() => void timeline.refetch()}
        />
      ) : (
        <div className="mt-4">
          <p className="text-sm text-text-secondary">
            {humanise(timeline.data.archetype)} · {humanise(timeline.data.status)} · as at{" "}
            {formatMoment(timeline.data.server_now)}
          </p>

          {moneyEvents.length === 0 ? (
            <EmptyState
              compact
              className="mt-3"
              title="No money has moved on this request"
              description="Requirement capture is free in both archetypes. A request with nothing here has simply not reached a charge yet."
            />
          ) : (
            <ul className="mt-3 list-none space-y-3 p-0">
              {moneyEvents.map((event, index) => (
                <MoneyEventCard
                  key={`${event.type}-${event.at}-${String(index)}`}
                  type={event.type}
                  at={event.at}
                  detail={event.detail}
                />
              ))}
            </ul>
          )}

          {otherCount > 0 ? (
            <p className="mt-3 text-sm text-text-secondary">
              {otherCount} other {otherCount === 1 ? "event" : "events"} on this request are not
              money and are not shown here.{" "}
              <Link
                href={`/operations/requests/${requirementId}`}
                className="text-text-link hover:underline"
              >
                Open the full history
              </Link>
              .
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Chargebacks
   --------------------------------------------------------------------------- */

function ChargebackPanel() {
  const record = useRecordChargeback();
  const [draft, setDraft] = useState<ChargebackDraft>(EMPTY_CHARGEBACK);
  const [confirming, setConfirming] = useState(false);

  const problems = validateChargeback(draft, isUuid);
  const paise = chargebackAmountPaise(draft.amountRupees);
  const ready = problems.length === 0 && paise !== null;

  const set = (patch: Partial<ChargebackDraft>) => setDraft({ ...draft, ...patch });

  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-text">Record a chargeback</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        The Customer&rsquo;s bank pulled a charge back. Recording it opens a case that holds
        payout. <strong>The fee row itself does not move</strong> — a chargeback is a claim in
        progress, and marking an earned fee refunded would tell both parties a decision had been
        taken that has not.
      </p>

      {record.isError ? (
        <ErrorState
          inline
          className="mt-3"
          title="We could not record that chargeback"
          message="Nothing has changed. Check the payment attempt id and the bank reference, then try again."
        />
      ) : null}

      {record.isSuccess && record.data ? (
        <div className="mt-3 rounded-control border border-line bg-surface-sunken p-4">
          <p className="text-sm text-text">
            Recorded. Case <strong>{maskId(record.data.id)}</strong> now owns it and is{" "}
            {record.data.holds_payout ? "holding payout" : "not holding payout"}.
          </p>
          <Link
            href={`/operations/cases?case=${record.data.id}`}
            className="mt-2 inline-block text-sm font-semibold text-text-link hover:underline"
          >
            Open the case
          </Link>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Payment attempt id" error={problemFor(problems, "paymentAttemptId")}>
          <Input
            value={draft.paymentAttemptId}
            onChange={(event) => set({ paymentAttemptId: event.target.value })}
          />
        </Field>
        <Field
          label="Amount in rupees"
          description="Exactly as the bank's notice states it."
          error={problemFor(problems, "amountRupees")}
        >
          <Input
            inputMode="decimal"
            value={draft.amountRupees}
            onChange={(event) => set({ amountRupees: event.target.value })}
          />
        </Field>
        <Field
          label="Bank reference"
          description="Required. Without it this cannot be reconciled, and recording one would be recording a rumour."
          error={problemFor(problems, "providerReference")}
        >
          <Input
            value={draft.providerReference}
            onChange={(event) => set({ providerReference: event.target.value })}
          />
        </Field>
        <Field label="Reason code" error={problemFor(problems, "reasonCode")}>
          <Input
            value={draft.reasonCode}
            onChange={(event) => set({ reasonCode: event.target.value })}
          />
        </Field>
      </div>

      <Button className="mt-4" disabled={!ready} onClick={() => setConfirming(true)}>
        Record it
      </Button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Record this chargeback"
        confirmLabel="Record it"
        destructive
        pending={record.isPending}
        consequence={
          <>
            <p>
              A <strong>chargeback case</strong> opens against this payment and{" "}
              <strong>freezes the vendor earnings funded from it</strong>. They stop being payable
              until somebody decides the case.
            </p>
            <p className="mt-2">
              A financial exception opens alongside it, so it appears in what Finance is carrying.
              The fee row is left exactly as it is.
            </p>
            <p className="mt-2">
              {paise === null ? null : (
                <>
                  Recording <strong>{formatMoney(paise)}</strong> against reference{" "}
                  <strong>{draft.providerReference.trim()}</strong>.
                </>
              )}
            </p>
          </>
        }
        onConfirm={() => {
          if (paise === null) return;
          record.mutate(
            {
              paymentAttemptId: draft.paymentAttemptId.trim(),
              amountPaise: paise,
              providerReference: draft.providerReference.trim(),
              reasonCode: draft.reasonCode.trim(),
            },
            {
              onSuccess: () => {
                setConfirming(false);
                setDraft(EMPTY_CHARGEBACK);
              },
            },
          );
        }}
      />
    </Card>
  );
}

export function MoneyConsole() {
  return (
    <div className="flex flex-col gap-6">
      <ReconciliationPanel />
      <div className="grid gap-6 lg:grid-cols-2">
        <PayoutHoldPanel />
        <ChargebackPanel />
      </div>
      <RequestMoneyPanel />
    </div>
  );
}
