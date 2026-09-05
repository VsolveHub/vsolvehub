"use client";

import { useServerCountdown } from "@vsolve/query";
import { Badge, Card, formatMoney } from "@vsolve/ui";

import { findCrewOfferDeclineReason } from "../model/decline-reasons";
import {
  DONT_TRAVEL_YET,
  HOLD_LAPSED,
  crewSizeLine,
  describeAccept,
  startDayLabel,
  type CrewOfferAnswer,
} from "../model/offer-state";

/**
 * What the lead just did, kept on screen after the server stops returning the row.
 *
 * `GET /partner/crew-offers/` filters to `INVITED`, so the answered row leaves
 * the list on the invalidation that follows either command. The answer lives in
 * the screen's own state and is drawn here until the lead leaves.
 *
 * ## The sentence this component exists for
 *
 * **"Don't travel yet."** A held win is not a confirmed job (07 §4c): the lead
 * won the cascade, the Customer is only now paying the booking fee, and only a
 * verified provider callback creates the engagement.
 *
 * ## The Customer's numbers are not rendered
 *
 * `lead_receipt_paise` is the only money drawn here, and since contract 1.30.0 it
 * is the only money the accept response carries.
 */

export interface CrewOfferOutcomeProps {
  readonly answer: CrewOfferAnswer;
}

export function CrewOfferOutcome({ answer }: CrewOfferOutcomeProps) {
  return answer.kind === "accepted" ? (
    <AcceptedOutcome answer={answer} />
  ) : (
    <DeclinedOutcome answer={answer} />
  );
}

function AcceptedOutcome({ answer }: { readonly answer: Extract<CrewOfferAnswer, { kind: "accepted" }> }) {
  const { booking, offer } = answer;
  const outcome = describeAccept(booking);
  // The hold clock. `hold_expires_at` is nullable and a null is a real answer —
  // the window is server configuration — so no countdown is drawn from a guess.
  const hold = useServerCountdown(outcome.isHeld ? booking.hold_expires_at : null, 1000);
  const lapsed = outcome.isHeld && (hold?.isExpired ?? false);
  const tone = lapsed ? "neutral" : outcome.isHeld ? "warning" : outcome.tone === "action" ? "success" : "neutral";

  const where = [offer.area_label.trim() || null, startDayLabel(offer.requested_start)]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <Badge tone={tone} dot>
        {lapsed ? "Hold lapsed" : `✓ ${outcome.title}`}
      </Badge>

      {lapsed ? (
        <p className="text-base font-semibold leading-6 text-text">{HOLD_LAPSED}</p>
      ) : (
        <>
          <p className="flex items-center justify-between gap-3 text-base font-semibold leading-6 text-text">
            <span>{outcome.message}</span>
            {hold ? (
              <span className="shrink-0 tabular-nums text-text-secondary">
                <span aria-hidden>⏱ {hold.display}</span>
                <span className="sr-only">{hold.announce}</span>
              </span>
            ) : null}
          </p>
          {outcome.isHeld ? (
            <p className="text-sm font-semibold leading-6 text-warning-text">{DONT_TRAVEL_YET}</p>
          ) : null}
        </>
      )}

      <p className="text-sm leading-6 text-text-secondary">
        {where === "" ? "" : `${where} · `}
        {booking.headcount} × {booking.days} {booking.days === 1 ? "day" : "days"}
      </p>
      {lapsed ? null : (
        <p className="text-sm leading-6 text-text-secondary">
          {formatMoney(booking.lead_receipt_paise)} to you · paid daily by customer
        </p>
      )}
    </Card>
  );
}

/**
 * A pass, confirmed back to the lead. Says what the reason is *for* in one
 * line, because ADR-0009 makes the decline rate an Operations alarm.
 */
function DeclinedOutcome({ answer }: { readonly answer: Extract<CrewOfferAnswer, { kind: "declined" }> }) {
  const reason = findCrewOfferDeclineReason(answer.reasonCode);

  return (
    <Card className="flex flex-col gap-2 p-4">
      <Badge tone="neutral" dot>
        Passed
      </Badge>
      <p className="text-sm leading-6 text-text-secondary">
        {crewSizeLine(answer.offer.headcount, answer.offer.days)} — gone to the next lead. Nothing
        against you.
      </p>
      {reason ? <p className="text-sm leading-6 text-text-secondary">{reason.consequence}</p> : null}
    </Card>
  );
}
