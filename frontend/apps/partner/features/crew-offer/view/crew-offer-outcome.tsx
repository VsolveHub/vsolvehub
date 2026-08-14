"use client";

import { Badge, Card, Readout, formatMoney } from "@vsolve/ui";

import { timeAgo } from "@/lib/format";

import { findCrewOfferDeclineReason } from "../model/decline-reasons";
import {
  WAGE_SETTLEMENT,
  dayNoun,
  describeAccept,
  describeHoldWindow,
  helperNoun,
  type CrewOfferAnswer,
} from "../model/offer-state";

/**
 * What the lead just did, kept on screen after the server stops returning the row.
 *
 * The other half of the defect described on `CrewOfferAnswerHandlers`. This panel
 * is deliberately **not** rendered by the offer card: `GET /partner/crew-offers/`
 * filters to `INVITED`, so the answered row leaves the list on the invalidation
 * that follows either command, and anything rendered from inside that row unmounts
 * with it. The answer lives in the list's own state and is drawn here, above the
 * live offers, until the lead leaves the screen.
 *
 * ## The sentence this component exists for
 *
 * **"Do not travel yet."** A held win is not a confirmed job (07 §4c): the lead
 * won the cascade, the Customer is only now paying the booking fee, and only a
 * verified provider callback creates the engagement. ADR-0009 names the failure
 * being avoided — a crew sent to a site against an unpaid hold is worse than a
 * wait — and the A5 held visit slot already says it in exactly these words.
 *
 * ## The Customer's numbers are not rendered, at any status
 *
 * `RateCardBooking` carries `total_customer_paise` and `booking_fee_paise`. Only
 * `lead_receipt_paise` is drawn. A lead shown the all-inclusive figure would
 * reasonably expect to receive it, and the difference is this platform's fee.
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
  const tone = outcome.isHeld ? "warning" : outcome.tone === "action" ? "success" : "neutral";

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone} dot>
          {outcome.title}
        </Badge>
        <span className="text-sm text-text-secondary">
          {offer.headcount} {helperNoun(offer.headcount)} for {offer.days} {dayNoun(offer.days)}
        </span>
      </div>

      {outcome.isHeld ? (
        <Readout
          label="Before you do anything"
          value="Do not travel yet"
          tone="warning"
          size="sm"
          caption={
            booking.hold_expires_at === null
              ? undefined
              : `Held until ${timeAgo(booking.hold_expires_at)}`
          }
        />
      ) : null}

      <p className="text-sm leading-6 text-text-secondary">{outcome.message}</p>

      {outcome.isHeld ? (
        <p className="text-sm leading-6 text-text-secondary">{describeHoldWindow(booking)}</p>
      ) : null}

      <Readout
        label="Your money for this job"
        value={formatMoney(booking.lead_receipt_paise)}
        tone="neutral"
        size="sm"
        caption={`${booking.headcount} ${helperNoun(booking.headcount)} × ${booking.days} ${dayNoun(booking.days)}`}
      />
      <p className="text-sm leading-6 text-text-secondary">{WAGE_SETTLEMENT}</p>
    </Card>
  );
}

/**
 * A pass, confirmed back to the lead.
 *
 * Says what the reason is *for* rather than thanking them for it. A lead who has
 * just told this platform its published rate is too low should be able to see
 * that the answer went somewhere, because that is the only claim that makes the
 * required field honest — ADR-0009 makes the decline rate an Operations alarm.
 */
function DeclinedOutcome({ answer }: { readonly answer: Extract<CrewOfferAnswer, { kind: "declined" }> }) {
  const reason = findCrewOfferDeclineReason(answer.reasonCode);

  return (
    <Card className="flex flex-col gap-2 p-4">
      <Badge tone="neutral" dot>
        You passed on this
      </Badge>
      <p className="text-sm leading-6 text-text-secondary">
        {answer.offer.headcount} {helperNoun(answer.offer.headcount)} for {answer.offer.days}{" "}
        {dayNoun(answer.offer.days)} — this has gone to the next lead. Nothing counts against you.
      </p>
      {reason ? <p className="text-sm leading-6 text-text-secondary">{reason.consequence}</p> : null}
    </Card>
  );
}
