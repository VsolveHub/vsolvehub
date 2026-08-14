"use client";

import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  ErrorState,
  FactList,
  Readout,
  formatMoney,
} from "@vsolve/ui";
import { categorizeError, describeError, useServerCountdown } from "@vsolve/query";
import { HardHat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { shortDate, timeAgo } from "@/lib/format";

import {
  ACCEPT_COMMITMENT,
  WAGE_SETTLEMENT,
  dayNoun,
  describeOfferClock,
  describeOvertime,
  helperNoun,
  isOfferAnswerable,
  offerClockStateFor,
  readOfferStatus,
  rosterShortfallOf,
  type CrewOffer,
  type CrewOfferAnswer,
} from "../model/offer-state";
import {
  isCapabilityRefusal,
  isCapacityUnavailable,
  isKycRequired,
  isOfferExpired,
  isOfferTaken,
  isRosterInsufficient,
  useAcceptCrewOffer,
  useDeclineCrewOffer,
} from "../queries";
import { CrewOfferDeclineDialog } from "./crew-offer-decline-dialog";

/**
 * One crew offer, on one phone screen.
 *
 * Closes `M2-FE-316`. The reading order is the decision order, and a lead makes
 * this decision standing in the street with one hand free:
 *
 *  1. **What you get.** The readout plate, from the server's own
 *     `lead_day_receipt_paise` — "You receive ₹X a day for 4 helpers" — with the
 *     total for the whole job under it and the settlement sentence beside it.
 *     Nothing on this screen computes that number from a rate card's parts.
 *  2. **How long you have.** A live dispatch clock, calibrated off the server.
 *  3. **What the job is.** Crew size, days, when, where, what a day includes.
 *  4. **What accepting means.** The published rate is the rate, extras go through
 *     the app, cash on the side is reportable.
 *  5. **Accept or pass**, with the pass carrying a required reason.
 *
 * ## The customer's number is not on this screen, at any status
 *
 * `CrewOffer` publishes no `total_customer_paise` and no `booking_fee_paise`, and
 * the `RateCardBooking` that comes back from accept carries both — neither is
 * rendered. ADR-0009 is explicit: a lead shown the customer's all-inclusive rate
 * would reasonably expect to receive it, and a published rate that starts an
 * argument on site is worse than no published rate.
 *
 * ## The accept button is never disabled on this screen's own reading
 *
 * The roster warning, the clock and the status all narrow what is *offered* and
 * none of them is allowed to be the authority. This card's copy of the roster
 * count can be a minute old, and a verification can land while the screen is
 * open — a button that refuses on a stale read is the dead submit `M2-FE-315`
 * already learned not to ship. The server decides; the screen explains.
 *
 * ## The outcome is not rendered here, and that is the whole point
 *
 * A successful accept or decline removes this offer from the server's next read
 * (`GET /partner/crew-offers/` filters to `INVITED`), so this component unmounts
 * moments after either command lands. Anything it rendered from `mutation.data`
 * would flash and vanish — including "do not travel yet". The answer is handed
 * up through `onAnswered` and drawn by `CrewOfferOutcome`, which outlives the row.
 *
 * Refusals stay here, because a refused command leaves the offer in the list and
 * the lead standing in front of the thing they were trying to answer.
 */

export interface CrewOfferCardProps {
  readonly offer: CrewOffer;
  /** Where the roster lives, for the one refusal a lead can actually fix. */
  readonly crewHref: string;
  /** Handed the server's answer while this row still exists. */
  readonly onAnswered: (answer: CrewOfferAnswer) => void;
}

export function CrewOfferCard({ offer, crewHref, onAnswered }: CrewOfferCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [decliningOpen, setDecliningOpen] = useState(false);
  const router = useRouter();

  const accept = useAcceptCrewOffer(offer.invitation_id, {
    onAccepted: (booking) => {
      setConfirming(false);
      onAnswered({ kind: "accepted", offer, booking });
    },
  });

  const decline = useDeclineCrewOffer(offer.invitation_id, {
    onDeclined: (declined, input) => {
      setDecliningOpen(false);
      onAnswered({ kind: "declined", offer: declined, reasonCode: input.reasonCode });
    },
  });

  // Ticking once a second is right here and would be a battery leak on the
  // enquiry inbox: this deadline is minutes away, not hours.
  const countdown = useServerCountdown(offer.responds_by, 1000);
  const clock = offerClockStateFor({
    respondsBy: offer.responds_by,
    remainingMs: countdown?.remainingMs ?? null,
  });

  const shortfall = rosterShortfallOf(offer);
  const status = readOfferStatus(offer.status);
  const answerable = isOfferAnswerable(offer);
  const overtime = describeOvertime(offer);

  if (!answerable) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <Badge tone={status === "DECLINED" ? "neutral" : "warning"} dot>
          {status === "DECLINED" ? "You passed on this" : "No longer open to you"}
        </Badge>
        <p className="text-sm leading-6 text-text-secondary">
          {status === "DECLINED"
            ? "This offer has gone to the next lead. Nothing counts against you, and your reason has been recorded against the rate for your city."
            : "This offer is no longer waiting on you. Nothing counts against you."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      {/* 1. Your number. First, largest, and read from the server. */}
      <div className="flex flex-col gap-2">
        <Readout
          label={`You receive, per day, for ${offer.headcount} ${helperNoun(offer.headcount)}`}
          value={formatMoney(offer.lead_day_receipt_paise)}
          tone="active"
          size="lg"
          caption={`${formatMoney(offer.lead_total_receipt_paise)} for all ${offer.days} ${dayNoun(offer.days)}`}
        />
        <p className="text-sm leading-6 text-text-secondary">{WAGE_SETTLEMENT}</p>
      </div>

      {/* 2. The dispatch clock. Minutes, on the server's clock, not the phone's. */}
      <div className="flex flex-col gap-2">
        {countdown === null || clock === "none" ? (
          <p className="text-sm leading-6 text-text-secondary">{describeOfferClock("none")}</p>
        ) : (
          <>
            <Readout
              label={clock === "passed" ? "Offer window" : "Time to answer"}
              value={clock === "passed" ? "Closed" : countdown.display}
              announce={
                clock === "passed" ? "The offer window has closed" : countdown.announce
              }
              tone={clock === "passed" ? "danger" : clock === "closing" ? "warning" : "active"}
              size="sm"
              caption={offer.responds_by ? `Until ${timeAgo(offer.responds_by)}` : undefined}
            />
            <p className="text-sm leading-6 text-text-secondary">{describeOfferClock(clock)}</p>
          </>
        )}
      </div>

      {/* 3. The job itself. */}
      <FactList
        items={[
          { label: "Crew", value: `${offer.headcount} ${helperNoun(offer.headcount)}` },
          { label: "Length", value: `${offer.days} ${dayNoun(offer.days)}` },
          {
            label: "Starts",
            value: offer.requested_start ? shortDate(offer.requested_start) : "Not stated",
          },
          { label: "Where", value: offer.area_label === "" ? "Not stated" : offer.area_label },
          { label: "A day is", value: `${offer.standard_day_hours} hours` },
        ]}
      />

      {offer.inclusions.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-text">What the day covers</h3>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-text-secondary">
            {/* Keyed by position: `inclusions` is ops-authored free text and two
                identical lines on one card are a duplicate React key, not an
                impossibility. Nothing here reorders. */}
            {offer.inclusions.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {overtime ? <p className="text-sm leading-6 text-text-secondary">{overtime}</p> : null}

      {/* The one refusal a lead can fix, said before the server has to say it. */}
      {shortfall ? (
        <Card className="flex flex-col gap-2 border-warning-line bg-warning-surface p-3">
          <p className="text-sm leading-6 text-text-secondary">
            <strong className="font-semibold text-warning-text">
              This job needs {shortfall.headcount} verified people and you have {shortfall.verified}
              .
            </strong>{" "}
            Vsolve will refuse this one until {shortfall.short} more of your crew are verified — one
            lead is accountable for the whole crew, so we never make it up from other agencies.
          </p>
          <Link
            href={crewHref}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-card border border-line bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <HardHat size={16} aria-hidden />
            Add or verify your crew
          </Link>
        </Card>
      ) : null}

      {/* 4. What accepting means. Before the tap, not after. */}
      <p className="text-sm leading-6 text-text-secondary">{ACCEPT_COMMITMENT}</p>

      {accept.error ? (
        <AcceptRefusal
          error={accept.error}
          onGoToCrew={() => router.push(crewHref)}
          onGoToVerification={() => router.push("/apply")}
          onRecover={() => accept.reset()}
        />
      ) : null}

      {/* 5. The two answers. */}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={accept.isPending}
          loadingLabel="Taking the job"
          disabled={accept.isPending || decline.isPending}
          onClick={() => setConfirming(true)}
        >
          Take this job
        </Button>
        <Button
          variant="outline"
          disabled={accept.isPending || decline.isPending}
          onClick={() => setDecliningOpen(true)}
        >
          Pass
        </Button>
      </div>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={`Take ${crewSummary(offer)} at ${formatMoney(offer.lead_day_receipt_paise)} a day?`}
        consequence={`${ACCEPT_COMMITMENT} If you are the first to answer, the job is held for you while the customer pays the booking fee that confirms it — do not travel until Vsolve confirms.`}
        confirmLabel="Yes, take it at this rate"
        pending={accept.isPending}
        onConfirm={() => {
          // The dialog is closed by `onAccepted`, not here: a mutate-level
          // callback is not delivered if this row unmounts first, and this row
          // unmounts on exactly the success path.
          accept.mutate();
        }}
      />

      <CrewOfferDeclineDialog
        open={decliningOpen}
        onOpenChange={setDecliningOpen}
        pending={decline.isPending}
        error={decline.error ? describeError(decline.error, "mutation").message : null}
        onDecline={(input) => {
          decline.mutate(input);
        }}
      />
    </Card>
  );
}

function crewSummary(offer: CrewOffer): string {
  return `${offer.headcount} ${helperNoun(offer.headcount)} for ${offer.days} ${dayNoun(offer.days)}`;
}

/**
 * A refused accept.
 *
 * Every branch recovers by re-reading rather than by resending — there is no
 * idempotency key on this command, so a blind retry is a second attempt, not a
 * replay. Two branches matter more than the rest:
 *
 * - `m2_roster_insufficient` is the only one the lead can fix, and it is sent to
 *   the roster rather than to a banner that names a problem with no door.
 * - `m2_invitation_slots_exhausted` must not read as a fault. Somebody answered
 *   first; that is the cascade working, nothing was charged, and nothing counts
 *   against this vendor's standing.
 */
function AcceptRefusal({
  error,
  onGoToCrew,
  onGoToVerification,
  onRecover,
}: {
  readonly error: unknown;
  readonly onGoToCrew: () => void;
  readonly onGoToVerification: () => void;
  readonly onRecover: () => void;
}) {
  const presentation = describeError(error, "mutation");

  if (isRosterInsufficient(error)) {
    return (
      <ErrorState
        inline
        title="Your verified crew is smaller than this job"
        message="Vsolve sends one lead who is accountable for the whole crew, so we never make the numbers up from another agency. Add the people you would actually send and get them verified — you will be offered this size of job again."
        severity="warning"
        actionLabel="Go to your crew"
        onAction={onGoToCrew}
      />
    );
  }

  if (isOfferTaken(error)) {
    return (
      <ErrorState
        inline
        title="Another lead answered first"
        message="A rate-card job has one crew and the first answer takes it. Nothing was charged and nothing counts against you — the next offer is usually minutes away."
        severity="info"
        actionLabel="Back to my offers"
        onAction={onRecover}
      />
    );
  }

  if (isCapacityUnavailable(error)) {
    return (
      <ErrorState
        inline
        title="You are already committed on those days"
        message="Vsolve checks this against everything else in your calendar, including your task jobs, so a crew cannot be promised twice. Free the days up or wait for the next offer."
        severity="warning"
        actionLabel="Back to my offers"
        onAction={onRecover}
      />
    );
  }

  if (isOfferExpired(error)) {
    return (
      <ErrorState
        inline
        title="This offer ran out"
        message="It went to the next lead before your answer landed. Nothing counts against you."
        severity="warning"
        actionLabel="Back to my offers"
        onAction={onRecover}
      />
    );
  }

  if (isKycRequired(error)) {
    return (
      <ErrorState
        inline
        title="Vsolve needs to verify you first"
        message={presentation.message}
        severity="warning"
        actionLabel="Finish verification"
        onAction={onGoToVerification}
      />
    );
  }

  if (isCapabilityRefusal(error)) {
    return (
      <ErrorState
        inline
        title="Your workforce approval does not cover this"
        message={presentation.message}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  return (
    <ErrorState
      inline
      title={presentation.title}
      message={presentation.message}
      severity={categorizeError(error) === "expired" ? "warning" : presentation.severity}
      actionLabel="Re-read your offers"
      onAction={onRecover}
      reference={presentation.reference}
    />
  );
}
