"use client";

import { canRecordCrewDay, describeError, isNotAShiftDay, type ShortfallChoice } from "@vsolve/query";
import { Button, ConfirmAction, Skeleton, buttonStyles, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { useConfirmCrewArrival, useRateCardState, useReportCrewNoShow } from "@/features/crew/queries";
import { toShiftDayView, type ShiftDayView } from "@/features/shift-day/adapters";
import { useConfirmDaySettled, useRespondToAttendance, useShiftDay } from "@/features/shift-day/queries";
import { WageLine } from "@/features/crew/view/wage-line";

import type { AmendmentView, StageView } from "../adapters";
import { useAcceptAmendment, useDeclineAmendment } from "../queries";

/**
 * The one live card for today's day — screens 6/9/10 of the A3 post-booking
 * redesign. It reads the first day that is not settled (or cancelled) and
 * renders exactly one state for it: before arrival, arrived-no-count,
 * supervisor's count awaiting the customer, awaiting payment, claimed,
 * settled, or disputed. Every mutation here already exists — this card only
 * changes which screen it is rendered on.
 */

export interface TodayCardProps {
  engagementId: string;
  requirementId: string;
  day: StageView;
  /** The one live change request against this day, if any. */
  pendingAmendment: AmendmentView | null;
  onDone: () => void;
  /** Opens the "Not right?" sheet for this day's shift, once it has loaded. */
  onNotRight: (shift: ShiftDayView) => void;
}

const SHORTFALL_ROWS: readonly { choice: ShortfallChoice; label: string }[] = [
  { choice: "CONTINUE_SHORT", label: "Carry on short" },
  { choice: "ADD_DAY", label: "Ask for an extra day" },
  { choice: "CANCEL_SHORTFALL", label: "Cancel the missing" },
];

export function TodayCard({
  engagementId,
  requirementId,
  day,
  pendingAmendment,
  onDone,
  onNotRight,
}: TodayCardProps) {
  const dayQuery = useShiftDay(engagementId, day.stageId, true);

  if (dayQuery.isPending) {
    return (
      <div className="rounded-card border border-line bg-surface p-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading today</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (dayQuery.data === undefined) {
    if (isNotAShiftDay(dayQuery.error)) return null;
    const presentation = describeError(dayQuery.error, "read");
    return (
      <div className="rounded-card border border-danger-line bg-danger-surface p-4">
        <p className="text-sm font-semibold text-text">{presentation.title}</p>
        <button
          type="button"
          onClick={() => void dayQuery.refetch()}
          className="mt-2 text-sm font-semibold text-text-link underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  const shift = toShiftDayView(dayQuery.data);
  const refresh = () => {
    void dayQuery.refetch();
    onDone();
  };

  return (
    <TodayCardBody
      engagementId={engagementId}
      requirementId={requirementId}
      day={day}
      shift={shift}
      pendingAmendment={pendingAmendment}
      onDone={refresh}
      onNotRight={onNotRight}
    />
  );
}

function TodayCardBody({
  engagementId,
  requirementId,
  day,
  shift,
  pendingAmendment,
  onDone,
  onNotRight,
}: {
  engagementId: string;
  requirementId: string;
  day: StageView;
  shift: ShiftDayView;
  pendingAmendment: AmendmentView | null;
  onDone: () => void;
  onNotRight: (shift: ShiftDayView) => void;
}) {
  const rateQuery = useRateCardState(requirementId, day.position === 1);
  const arrival = useConfirmCrewArrival();
  const noShow = useReportCrewNoShow();
  const respond = useRespondToAttendance();
  const settle = useConfirmDaySettled();
  const [confirmingNoShow, setConfirmingNoShow] = useState(false);
  const [shortfallChoice, setShortfallChoice] = useState<ShortfallChoice | null>(null);
  const [confirmingShortfall, setConfirmingShortfall] = useState(false);
  const [paidCash, setPaidCash] = useState(false);

  const supervisorName = shift.crew.find((member) => member.isSupervisor)?.displayName ?? "The supervisor";
  const helperCount = shift.hasCrew ? shift.crew.filter((member) => !member.isSupervisor).length : null;
  const crewLine =
    helperCount === null || helperCount <= 0
      ? supervisorName
      : `${supervisorName} + ${helperCount} coming`;

  const amendmentRow = pendingAmendment !== null && pendingAmendment.isDecidable ? (
    <AmendmentRow engagementId={engagementId} amendment={pendingAmendment} />
  ) : null;

  // Before arrival — day 1 only. Later days have no customer arrival action;
  // the supervisor's own record is what moves `arrival_confirmed_at`.
  const canRecordArrival = day.position === 1 && (rateQuery.data === undefined ? false : canRecordCrewDay(rateQuery.data));
  // The server's own fee amount, never a figure this screen invents.
  const feeAmountLabel =
    rateQuery.data?.booking_fee != null ? formatMoney(rateQuery.data.booking_fee.amount_paise) : "the booking fee";

  if (shift.attendance === "not_started" || shift.attendance === "awaiting_arrival") {
    if (!canRecordArrival) {
      return (
        <Card>
          {amendmentRow}
          <p className="text-base text-text">{crewLine}</p>
          <p className="mt-1 text-sm text-text-secondary">Not arrived yet.</p>
        </Card>
      );
    }
    return (
      <Card>
        {amendmentRow}
        <p className="text-base text-text">{crewLine}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => arrival.mutate({ requirementId })}
            loading={arrival.isPending}
            loadingLabel="Recording"
          >
            They came
          </Button>
          <Button variant="outline" onClick={() => setConfirmingNoShow(true)} disabled={arrival.isPending || noShow.isPending}>
            Nobody came
          </Button>
        </div>
        <ConfirmAction
          open={confirmingNoShow}
          onOpenChange={setConfirmingNoShow}
          title="Nobody came?"
          consequence={`${feeAmountLabel} refunded and we find another crew at the same rate.`}
          confirmLabel="Nobody came"
          cancelLabel="Go back"
          onConfirm={() => {
            noShow.mutate({ requirementId }, { onSuccess: onDone });
            setConfirmingNoShow(false);
          }}
          pending={noShow.isPending}
          destructive
        />
      </Card>
    );
  }

  if (shift.attendance === "awaiting_supervisor") {
    return (
      <Card>
        {amendmentRow}
        <p className="text-base text-text">
          {shift.arrivalConfirmedAt === null
            ? "Arrived · Supervisor sends the count this evening."
            : `Arrived ${shift.arrivalConfirmedAt} · Supervisor sends the count this evening.`}
        </p>
      </Card>
    );
  }

  if (shift.attendance === "awaiting_you") {
    const present = shift.presentCount ?? 0;
    const expected = shift.expectedCount ?? 0;
    const countLine = `${supervisorName.split(" ")[0]} says ${present} of ${expected} came`;
    const overtimeNote = pendingAmendment !== null && pendingAmendment.kind === "TIME_EXTENSION" ? " · 2 h extra" : "";

    if (shift.mustChooseShortfall) {
      return (
        <Card>
          {amendmentRow}
          <p className="text-base text-text">
            {countLine}
            {overtimeNote}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {SHORTFALL_ROWS.map((row) => (
              <button
                key={row.choice}
                type="button"
                disabled={respond.isPending}
                onClick={() => {
                  setShortfallChoice(row.choice);
                  setConfirmingShortfall(true);
                }}
                className={buttonStyles({
                  variant: shortfallChoice === row.choice ? "primary" : "outline",
                  className: "justify-between",
                })}
              >
                {row.label}
              </button>
            ))}
          </div>
          <ConfirmAction
            open={confirmingShortfall}
            onOpenChange={(open) => {
              setConfirmingShortfall(open);
              if (!open) setShortfallChoice(null);
            }}
            title={shortfallChoice === null ? "" : `${SHORTFALL_ROWS.find((row) => row.choice === shortfallChoice)?.label}?`}
            consequence={`This confirms ${present} of ${expected} came.`}
            confirmLabel="Confirm the day"
            pending={respond.isPending}
            onConfirm={() => {
              if (shortfallChoice === null) return;
              respond.mutate(
                {
                  engagementId,
                  stageId: day.stageId,
                  response: "CONFIRM",
                  shortfallChoice,
                  workerDetails: [],
                  note: "",
                },
                {
                  onSuccess: () => {
                    setConfirmingShortfall(false);
                    setShortfallChoice(null);
                    onDone();
                  },
                },
              );
            }}
          />
        </Card>
      );
    }

    return (
      <Card>
        {amendmentRow}
        <p className="text-base text-text">
          {countLine}
          {overtimeNote}
        </p>
        <p className="mt-1 text-sm text-text-secondary">Today&apos;s amount {day.amountLabel}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            loading={respond.isPending}
            loadingLabel="Confirming"
            onClick={() =>
              respond.mutate(
                {
                  engagementId,
                  stageId: day.stageId,
                  response: "CONFIRM",
                  shortfallChoice: "",
                  workerDetails: [],
                  note: "",
                },
                { onSuccess: onDone },
              )
            }
          >
            Yes, that&apos;s right
          </Button>
          <button
            type="button"
            onClick={() => onNotRight(shift)}
            className="text-sm font-semibold text-text-link underline underline-offset-2"
          >
            Not right?
          </button>
        </div>
      </Card>
    );
  }

  if (shift.attendance === "you_confirmed") {
    const settlement = shift.settlement;
    if (settlement === null) {
      return (
        <Card>
          {amendmentRow}
          <p className="text-base text-text">Confirmed. Today&apos;s amount is being worked out.</p>
        </Card>
      );
    }

    if (settlement.phase === "both_agreed") {
      return (
        <Card>
          <p className="text-base font-semibold text-text">
            ✓ {day.label} · {settlement.amountLabel} paid
          </p>
        </Card>
      );
    }

    if (settlement.phase === "you_said_settled") {
      return (
        <Card>
          <p className="text-base text-text">You said paid · waiting for {supervisorName.split(" ")[0]}</p>
        </Card>
      );
    }

    // `nobody_yet` or the supervisor claimed first — either way, this is the
    // customer's turn to pay. The UPI hand-off moves no money by itself — it
    // only opens the customer's own app — so "Yes, paid" is the one tap that
    // actually calls `useConfirmDaySettled`, and it stands beside both routes
    // to it rather than behind either one.
    return (
      <Card>
        {amendmentRow}
        <p className="text-base font-semibold text-text">{settlement.amountLabel} to pay</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {settlement.paymentLink !== null ? (
            <a href={settlement.paymentLink} className={buttonStyles({ variant: "primary" })}>
              Pay on UPI {settlement.amountLabel}
            </a>
          ) : null}
          <Button variant={settlement.paymentLink === null ? "primary" : "outline"} onClick={() => setPaidCash(true)}>
            Paid cash
          </Button>
        </div>
        {paidCash || settlement.paymentLink !== null ? (
          <div className="mt-3">
            <Button
              loading={settle.isPending}
              loadingLabel="Recording"
              onClick={() =>
                settle.mutate({ engagementId, stageId: day.stageId }, { onSuccess: onDone })
              }
            >
              Yes, paid
            </Button>
          </div>
        ) : null}
        <WageLine className="mt-3" />
      </Card>
    );
  }

  if (shift.attendance === "you_disputed") {
    return (
      <Card>
        <p className="text-base font-semibold text-text">Count disputed · support will call</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm leading-6 text-text-secondary">
        This app cannot describe where today has got to — contact support before you act on it.
      </p>
    </Card>
  );
}

function AmendmentRow({ engagementId, amendment }: { engagementId: string; amendment: AmendmentView }) {
  const accept = useAcceptAmendment();
  const decline = useDeclineAmendment();
  const busy = accept.isPending || decline.isPending;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-control border border-warning-line bg-warning-surface px-3 py-2">
      <p className="text-sm font-medium text-text">
        Asks {amendment.kind === "TIME_EXTENSION" ? "extra time" : "a change"} · {amendment.deltaLabel}
      </p>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          loading={accept.isPending}
          loadingLabel="Approving"
          disabled={busy}
          onClick={() => accept.mutate({ engagementId, amendmentId: amendment.amendmentId })}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={decline.isPending}
          loadingLabel="Declining"
          disabled={busy}
          onClick={() => decline.mutate({ engagementId, amendmentId: amendment.amendmentId })}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-line bg-surface p-4">{children}</div>;
}
