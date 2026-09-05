"use client";

import { Badge, Button, ErrorState, Readout, formatMoney, useToast } from "@vsolve/ui";
import {
  attendanceIsDisputed,
  describeError,
  isStageTransitionNotAllowed,
  settlementAmountPaise,
  settlementPaymentLink,
  shiftSettlementClaim,
} from "@vsolve/query";

import { Pictogram } from "@/components/pictogram";
import { usePartnerEngagementAmendments } from "@/features/engagement/queries";
import { BookingSupport } from "@/features/support/view/booking-support";

import { useConfirmDaySettled, type ShiftCommandScope, type ShiftDay } from "../queries";
import { SETTLEMENT_STAYS_OPEN, settlementLabel } from "../model/shift-copy";
import { ExtrasDisclosure } from "./evening-close";

/**
 * After the count is sent — what the customer said, what to collect, one tap
 * when it is paid.
 *
 * The figure is the server's `amount_paise`: present workers at the day rate
 * plus every extra both sides accepted. Nothing here multiplies it out again.
 * The tap records who tapped and nothing else — wages are direct, daily and
 * peer-to-peer, and Vsolve never holds them. One tap on its own is "waiting
 * for {customer}", never "paid" and never a word stronger than that.
 *
 * The UPI link opens the customer's own UPI app at the lead's VPA for exactly
 * this amount, so it is offered as something to send, not a button to pay.
 */

const TONE = {
  action: "action",
  info: "info",
  neutral: "neutral",
  warning: "warning",
  success: "success",
} as const;

export interface SettlementPhaseProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  readonly canConfirm: boolean;
  readonly canPropose: boolean;
  readonly customerFirstName: string;
  readonly engagementId: string;
}

export function SettlementPhase({ day, scope, canConfirm, canPropose, customerFirstName, engagementId }: SettlementPhaseProps) {
  const confirm = useConfirmDaySettled(scope);
  const toast = useToast();

  const attendance = day.attendance;
  const settlement = day.settlement;
  const claim = shiftSettlementClaim(day);
  const wording = settlementLabel(claim, customerFirstName);
  const amountPaise = settlementAmountPaise(day);
  const link = settlementPaymentLink(day);
  const disputed = attendanceIsDisputed(day);
  const confirmed = attendance?.status === "CUSTOMER_CONFIRMED";
  const alreadyTapped = settlement?.supervisor_confirmed_at != null;

  const count =
    attendance === null || attendance.present_count === null
      ? ""
      : `${attendance.present_count} of ${attendance.expected_count}`;
  const extras = settlement !== null && settlement.extras_paise > 0 ? ` + ${formatMoney(settlement.extras_paise)} extras` : "";

  const share = async () => {
    if (link === null) return;
    const text = `Pay ${formatMoney(amountPaise ?? 0)} for today's crew: ${link}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast.notify("Link copied — send it to " + customerFirstName + ".");
    } catch {
      toast.notify("Could not share the link; copy it by hand below.");
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settle-heading">
      <div className="flex flex-col gap-1">
        <h2 id="settle-heading" className="flex items-center gap-2 text-lg font-semibold text-text">
          {claim === "settled" ? (
            <Pictogram name="done" size="sm" className="text-success-text" />
          ) : confirmed ? (
            <Pictogram name="yes" size="sm" className="text-success-text" />
          ) : null}
          {disputed
            ? `${customerFirstName} disputed the count`
            : confirmed
              ? `${customerFirstName} confirmed ${count}${extras}`
              : `Sent to ${customerFirstName} · ${count}`}
        </h2>
        <Badge tone={TONE[wording.tone]} dot>
          {wording.label}
        </Badge>
      </div>

      {disputed ? (
        <>
          {attendance !== null && attendance.dispute_note.trim() !== "" ? (
            <p className="whitespace-pre-wrap text-sm text-warning-text">
              {customerFirstName} said: {attendance.dispute_note}
            </p>
          ) : null}
          <p className="text-sm text-text-secondary">Vsolve is looking at it; the day stays open.</p>
          <BookingSupport reference={engagementId} />
        </>
      ) : null}

      {amountPaise === null ? null : (
        <Readout
          label={claim === "settled" ? "Paid" : "Collect"}
          value={formatMoney(amountPaise)}
          tone={claim === "settled" ? "success" : "active"}
        />
      )}

      <PendingExtras engagementId={scope.engagementId} stageId={scope.stageId} customerFirstName={customerFirstName} />

      {claim === "settled" || amountPaise === null ? null : (
        <div className="flex flex-col gap-2">
          {link === null ? null : (
            <Button type="button" variant="secondary" block onClick={() => void share()}>
              Share UPI link
            </Button>
          )}
          {alreadyTapped ? (
            <p className="text-sm text-text-secondary">You tapped; waiting for {customerFirstName}.</p>
          ) : canConfirm ? (
            <Button
              type="button"
              block
              size="lg"
              onClick={() => confirm.mutate()}
              loading={confirm.isPending}
              loadingLabel="Recording"
              disabled={confirm.isPending}
              icon={<Pictogram name="money" size="sm" />}
            >
              Got paid {formatMoney(amountPaise)}
            </Button>
          ) : (
            <p className="text-sm text-text-secondary">Your account cannot confirm a settlement right now.</p>
          )}
          <p className="text-xs text-text-muted">{SETTLEMENT_STAYS_OPEN}</p>
        </div>
      )}

      {confirm.isError ? <SettlementFailure error={confirm.error} /> : null}

      {claim === "settled" ? null : (
        <ExtrasDisclosure day={day} scope={scope} canPropose={canPropose} customerFirstName={customerFirstName} />
      )}
    </section>
  );
}

/** Extras asked for on this day, with where they stand. Read off the one amendment engine. */
function PendingExtras({
  engagementId,
  stageId,
  customerFirstName,
}: {
  readonly engagementId: string;
  readonly stageId: string;
  readonly customerFirstName: string;
}) {
  const query = usePartnerEngagementAmendments(engagementId);
  if (query.isPending || query.isError) return null;

  const mine = query.data.amendments.filter((amendment) => amendment.stage_id === stageId);
  if (mine.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {mine.map((amendment) => (
        <li key={amendment.id} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-text-secondary">
            {amendment.lines.map((line) => line.title).join(", ") || amendment.reason}
          </span>
          <span className="flex shrink-0 items-center gap-2 tabular-nums text-text">
            {formatMoney(amendment.delta_paise)}
            <ExtraBadge status={amendment.status} customerFirstName={customerFirstName} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function ExtraBadge({ status, customerFirstName }: { readonly status: string; readonly customerFirstName: string }) {
  switch (status) {
    case "ACCEPTED":
    case "APPLIED":
      return <Badge tone="success">OK&rsquo;d</Badge>;
    case "REJECTED":
      return <Badge tone="warning">Turned down</Badge>;
    case "EXPIRED":
      return <Badge tone="warning">Expired</Badge>;
    case "PROPOSED":
      return <Badge tone="info">Waiting for {customerFirstName}</Badge>;
    default:
      return <Badge tone="neutral">{status.replace(/[_-]+/g, " ").toLowerCase()}</Badge>;
  }
}

function SettlementFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");
  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title="Nothing to settle yet"
        message="Send today's count first."
        severity="warning"
        reference={presentation.reference}
      />
    );
  }
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
