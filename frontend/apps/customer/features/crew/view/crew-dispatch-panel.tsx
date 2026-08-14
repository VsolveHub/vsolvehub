"use client";

import {
  bookingFeePhase,
  bookingPhase,
  canCancelBooking,
  canCheckOutBookingFee,
  canRecordCrewDay,
  useServerCountdown,
  type BookingFeePhase,
  type RateCardBookingPhase,
} from "@vsolve/query";
import { Badge, Button, ConfirmAction, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
// Imported rather than taken as a prop, unlike `bookCrewFeeHref`: this
// destination is not a function of any record — every A3 engagement lands in the
// same list — and `lib/routes` exists precisely so both sides of the
// server/client boundary can name a route without a function crossing it.
import { engagementListHref } from "@/lib/routes";
import { confirmedCrewName, toBookingView, toFeeMoneyView, type BookingView, type FeeMoneyView } from "../adapters";
import {
  useCancelBooking,
  useConfirmCrewArrival,
  useRateCardState,
  useReportCrewNoShow,
} from "../queries";
import { RateDisclosure } from "./rate-disclosure";

/**
 * The A3 instant booking on `/requests/[id]` — `M2-FE-427` and `M2-FE-429`.
 *
 * Four things live here, and they are one panel because they are one record at
 * four moments:
 *
 * 1. **The cascade holding state.** "Confirming your crew", widening honestly as
 *    the waves go out, and **nothing to press** — the Customer cannot make a
 *    supervisor accept.
 * 2. **The held offer**, which is the only moment the booking fee is payable.
 * 3. **The confirmed booking**: who is coming, the frozen terms, and day one.
 * 4. **The money, truthfully**, whichever way it went.
 *
 * ## The fallback is a handoff, not a failure screen
 *
 * Past the configured cascade threshold the server records `FELL_BACK` and the
 * requirement is on the **quote flow** — the surface built in Wave A2, which is
 * still there and is deliberately not deleted. This panel explains the handoff
 * in one paragraph and then renders nothing more, because the unlock and teaser
 * surface takes over from that point. **Nothing has been charged when this
 * happens**, and the paragraph says so, because a Customer who was promised an
 * instant crew and got a wait needs to know it cost them nothing.
 *
 * ## Every owner-blocked number is absent rather than invented
 *
 * The free-cancellation window T and the forfeit split ratio are server
 * configuration and neither is published on any read. So this states the
 * **rules** — cancel early and the fee comes back whole; cancel late, or nobody
 * lets the crew in, and part of it pays the supervisor for travelling — and
 * prints a figure only once the server has settled one. While the window is
 * unset the cancel command refuses with `m2_policy_unavailable`, which
 * `AccessRefusal` renders as a support path rather than a retry.
 */

export interface CrewDispatchPanelProps {
  requirementId: string;
  /** The booking-fee checkout. This feature owns no route. */
  bookCrewFeeHref: string;
  supportAction?: ReactNode;
}

export function CrewDispatchPanel({
  requirementId,
  bookCrewFeeHref,
  supportAction,
}: CrewDispatchPanelProps) {
  const rateQuery = useRateCardState(requirementId);
  const cancel = useCancelBooking();
  const arrival = useConfirmCrewArrival();
  const noShow = useReportCrewNoShow();

  const [confirming, setConfirming] = useState<"cancel" | "no_show" | null>(null);

  const state = rateQuery.data ?? null;

  if (rateQuery.isPending) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your crew booking</span>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (rateQuery.isError || state === null) {
    return (
      <AccessRefusal
        error={rateQuery.error ?? new Error("No crew booking")}
        attempting="see your crew booking"
        onRetry={() => void rateQuery.refetch()}
        supportAction={supportAction}
        inline={false}
      />
    );
  }

  const phase: RateCardBookingPhase = bookingPhase(state);
  const feePhase: BookingFeePhase = bookingFeePhase(state);
  const booking = state.booking === null ? null : toBookingView(state.booking);
  const fee = state.booking_fee === null ? null : toFeeMoneyView(state.booking_fee);
  const crewName = confirmedCrewName(state);

  // No instant booking was ever made on this request. The quote surface owns the
  // screen; rendering an empty crew panel above it would imply a crew is coming.
  if (phase === "unbooked" || booking === null) return null;

  return (
    <section className="flex flex-col gap-4">
      {phase === "matching" ? <CascadeHolding booking={booking} /> : null}

      {phase === "offer_held" ? (
        <OfferHeld
          booking={booking}
          holdExpiresAt={booking.holdExpiresAt}
          canCheckOut={canCheckOutBookingFee(state)}
          bookCrewFeeHref={bookCrewFeeHref}
          feePhase={feePhase}
        />
      ) : null}

      {phase === "confirmed" ? <CrewConfirmed booking={booking} crewName={crewName} /> : null}

      {phase === "fell_back" ? <FallbackHandoff booking={booking} /> : null}

      {phase === "cancelled" ? (
        <div className="rounded-card border border-line bg-surface-sunken p-4">
          <p className="font-semibold text-text">This booking was cancelled</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            No crew is coming. What happened to the booking fee is below.
          </p>
        </div>
      ) : null}

      {fee !== null ? <FeeOutcome phase={feePhase} fee={fee} /> : null}

      {/* The frozen terms stay readable at every status after booking — a
          Customer settling a day needs the published rate they agreed to, not
          whatever the card says this week. */}
      {phase !== "fell_back" ? (
        <RateDisclosure
          rate={{
            headcount: booking.headcount,
            days: booking.days,
            dayRateLabel: booking.dayRateLabel,
            totalLabel: booking.totalLabel,
            leadReceiptLabel: booking.leadReceiptLabel,
            bookingFeeLabel: booking.bookingFeeLabel,
            standardDayHours: booking.standardDayHours,
            overtimeHourlyLabel: booking.overtimeHourlyLabel,
            inclusions: booking.inclusions,
            addOns: booking.addOns,
          }}
          isBooked
        />
      ) : null}

      {canRecordCrewDay(state) ? (
        <DayOne
          onArrived={() => arrival.mutate({ requirementId })}
          onNobodyCame={() => setConfirming("no_show")}
          isPending={arrival.isPending || noShow.isPending}
        />
      ) : null}

      {canCancelBooking(state) ? (
        <div>
          <Button
            variant="outline"
            onClick={() => setConfirming("cancel")}
            disabled={cancel.isPending}
          >
            Cancel this booking
          </Button>
        </div>
      ) : null}

      <AccessRefusal
        error={cancel.error ?? arrival.error ?? noShow.error}
        attempting="update this booking"
        supportAction={supportAction}
      />

      <ConfirmAction
        open={confirming === "cancel"}
        onOpenChange={(open) => setConfirming(open ? "cancel" : null)}
        title="Cancel this crew booking"
        // Both outcomes, because the client does not know which one applies:
        // the window T is server configuration and the server decides.
        consequence={
          <>
            No crew will come. There is a free-cancellation window that runs until
            a set number of hours before your start date —{" "}
            <strong className="font-semibold">
              cancel inside it and the {booking.bookingFeeLabel} booking fee comes
              back to you in full
            </strong>
            . Cancel after it and the fee is forfeited: part of it pays the
            supervisor for turning other work down, and the rest is ours. We will
            tell you exactly which happened as soon as you confirm.
          </>
        }
        confirmLabel="Cancel the booking"
        onConfirm={() => {
          cancel.mutate({ requirementId });
          setConfirming(null);
        }}
        pending={cancel.isPending}
        destructive
      />

      <ConfirmAction
        open={confirming === "no_show"}
        onOpenChange={(open) => setConfirming(open ? "no_show" : null)}
        title="Report that nobody arrived"
        consequence={
          <>
            This says the crew did not turn up.{" "}
            <strong className="font-semibold">
              Your {booking.bookingFeeLabel} booking fee is refunded in full
            </strong>
            , we look for another crew at the same rate at no extra cost, and the
            supervisor&rsquo;s standing with us carries the record. Nobody earns
            anything from a crew that did not arrive.
          </>
        }
        confirmLabel="They did not come"
        onConfirm={() => {
          noShow.mutate({ requirementId });
          setConfirming(null);
        }}
        pending={noShow.isPending}
        destructive
      />
    </section>
  );
}

/* --------------------------------------------------------------------------
   `M2-FE-427` — the holding state and the handoff
   -------------------------------------------------------------------------- */

/**
 * "Confirming your crew", and widening honestly.
 *
 * The wave number is the server's own and it is shown rather than hidden,
 * because the honest version of "we are still looking" is "we have widened the
 * search". **Nothing to press**: a Customer cannot make a supervisor accept, and
 * every control that could sit here would be one.
 *
 * The two-hour sentence is the product promise from ADR-0009's own flow diagram,
 * not a countdown — the cascade's wave size, timeout and widening steps are all
 * owner configuration and none of them is published on this read, so a timer
 * here would be a number this client invented. The panel re-reads on its own
 * while the cascade is live, which is what makes "still looking" true rather
 * than merely stale.
 */
function CascadeHolding({ booking }: { booking: BookingView }) {
  return (
    <div className="rounded-card border border-info-line bg-info-surface p-4" role="status">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-text">
          Confirming your crew — usually within 2 hours
        </p>
        <Badge tone="info" dot>
          {booking.wave <= 1 ? "Asking nearby supervisors" : "Search widened"}
        </Badge>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text">
        We have sent this to supervisors who can field{" "}
        {booking.headcount === 1 ? "one person" : `${booking.headcount} people`} at
        our published rate. The first one to accept gets the job.
        {booking.wave > 1
          ? " Nobody has taken it yet, so we have widened the search to more supervisors."
          : ""}
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        <strong className="font-semibold text-text">Nothing has been charged.</strong>{" "}
        You pay the {booking.bookingFeeLabel} booking fee only when somebody
        accepts, and nothing at all if nobody does.
      </p>
    </div>
  );
}

/**
 * The fallback handoff — the honest degradation, explained once.
 *
 * ADR-0009: *instant is never shown where it cannot be delivered — a
 * confirmed-then-ghosted crew is worse than a wait.* So this says what happened,
 * says it cost nothing, and hands over to the quote surface below rather than
 * repeating it.
 */
function FallbackHandoff({ booking }: { booking: BookingView }) {
  return (
    <div className="rounded-card border border-warning-line bg-warning-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-text">
          No supervisor took this at our published rate
        </p>
        <Badge tone="warning">Now collecting quotes</Badge>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text">
        We asked everyone we could and widened the search{" "}
        {booking.wave > 1 ? `${booking.wave} times` : "as far as we could"}. Rather
        than promise you a crew we cannot confirm, we have moved this request to
        the ordinary route: professionals will send you their own quotes and you
        choose one.
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        <strong className="font-semibold text-text">Nothing has been charged</strong>{" "}
        — the booking fee is only ever taken against a crew that accepted, and
        none did. Your request, your dates and everything you told us carried
        across.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   `M2-FE-428` entry point, and the confirmed booking
   -------------------------------------------------------------------------- */

function OfferHeld({
  booking,
  holdExpiresAt,
  canCheckOut,
  bookCrewFeeHref,
  feePhase,
}: {
  booking: BookingView;
  holdExpiresAt: string | null;
  canCheckOut: boolean;
  bookCrewFeeHref: string;
  feePhase: BookingFeePhase;
}) {
  const countdown = useServerCountdown(holdExpiresAt);

  return (
    <div className="rounded-card border border-success-line bg-success-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-text">A supervisor has accepted your job</p>
        <Badge tone="success">Holding it for you</Badge>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text">
        They have taken it at our published rate and are holding{" "}
        {booking.headcount === 1 ? "one person" : `${booking.headcount} people`} for
        your dates.
        {countdown !== null && !countdown.isExpired ? (
          <>
            {" "}
            The hold lasts{" "}
            <strong className="font-semibold" aria-label={countdown.announce}>
              {countdown.display}
            </strong>{" "}
            longer.
          </>
        ) : null}
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Pay the {booking.bookingFeeLabel} booking fee to confirm them. If you do
        not, the hold lapses and we keep looking —{" "}
        <strong className="font-semibold text-text">nothing is charged</strong>{" "}
        either way.
      </p>
      {feePhase === "pending" ? (
        <p className="mt-3 max-w-prose text-sm leading-6 text-text" role="status">
          We are confirming your payment. This updates itself when your bank or UPI
          app tells us the outcome — do not pay again.
        </p>
      ) : canCheckOut ? (
        <div className="mt-3">
          <Link href={bookCrewFeeHref} className={buttonStyles({ variant: "primary" })}>
            Confirm this crew — {booking.bookingFeeLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function CrewConfirmed({
  booking,
  crewName,
}: {
  booking: BookingView;
  crewName: string | null;
}) {
  return (
    <div className="rounded-card border border-success-line bg-success-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-text">Your crew is confirmed</p>
        <Badge tone="success">Booked</Badge>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text">
        {crewName !== null ? (
          <>
            <strong className="font-semibold">{crewName}</strong> is bringing{" "}
          </>
        ) : (
          "A supervisor is bringing "
        )}
        {booking.headcount === 1 ? "one person" : `${booking.headcount} people`} for{" "}
        {booking.days} {booking.days === 1 ? "day" : "days"}.
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        You pay them {booking.leadReceiptLabel} for the work,{" "}
        <strong className="font-semibold text-text">
          directly, at the end of each day
        </strong>
        . We never hold that money.
      </p>
      {/* The engagement the verified callback created. Reached through the list
          rather than by id, because `RateCardState` publishes the confirmed
          partner and no engagement id — see the execution plan §7. */}
      <div className="mt-3">
        <Link
          href={engagementListHref("lead_only")}
          className={buttonStyles({ variant: "outline" })}
        >
          Open this booking
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   `M2-FE-429` — day one, and where the money went
   -------------------------------------------------------------------------- */

function DayOne({
  onArrived,
  onNobodyCame,
  isPending,
}: {
  onArrived: () => void;
  onNobodyCame: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="font-semibold text-text">On the first day</p>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Tell us whether they turned up. Either of you can confirm the arrival —
        there is no code to read out.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button onClick={onArrived} loading={isPending} loadingLabel="Recording">
          They have arrived
        </Button>
        <Button variant="outline" onClick={onNobodyCame} disabled={isPending}>
          Nobody came
        </Button>
      </div>
    </div>
  );
}

/**
 * What happened to the booking fee, said plainly.
 *
 * The forfeit branch is the one this component exists for: the Customer is being
 * told they lost money, so it names both halves, says where each went and prints
 * the server's own figures. The ratio behind them is owner configuration and is
 * never quoted as a percentage here — `amount = travel compensation + platform
 * share` is the reconciliation, and the two numbers arrive already split.
 */
function FeeOutcome({ phase, fee }: { phase: BookingFeePhase; fee: FeeMoneyView }) {
  if (phase === "forfeited") {
    return (
      <div className="rounded-card border border-warning-line bg-warning-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold text-text">
            Your {fee.amountLabel} booking fee was not returned
          </p>
          <Badge tone="warning">Forfeited</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text">
          The crew travelled to your site and could not work. We do not give the
          fee back in that case, and we do not keep all of it either:
        </p>
        <dl className="mt-3 divide-y divide-warning-line rounded-card border border-warning-line bg-surface">
          {fee.travelCompensationLabel !== null ? (
            <div className="flex items-baseline justify-between gap-3 p-3">
              <dt className="text-sm text-text-secondary">
                To the supervisor, for the journey his team made
              </dt>
              <dd data-numeric className="font-medium text-text">
                {fee.travelCompensationLabel}
              </dd>
            </div>
          ) : null}
          {fee.platformShareLabel !== null ? (
            <div className="flex items-baseline justify-between gap-3 p-3">
              <dt className="text-sm text-text-secondary">Kept by Vsolve</dt>
              <dd data-numeric className="font-medium text-text">
                {fee.platformShareLabel}
              </dd>
            </div>
          ) : null}
        </dl>
        <ReceiptLine fee={fee} />
      </div>
    );
  }

  if (phase === "refunded") {
    return (
      <div className="rounded-card border border-info-line bg-info-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold text-text">
            Your {fee.amountLabel} booking fee has been refunded in full
          </p>
          <Badge tone="info">Refunded</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text">
          Nobody earns anything from a crew that did not deliver — not the
          supervisor and not us. It reaches your account the way you paid it.
        </p>
        <ReceiptLine fee={fee} />
      </div>
    );
  }

  if (phase === "earned") {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="font-semibold text-text">Your crew arrived</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          The {fee.amountLabel} booking fee is settled. Everything else is between
          you and the supervisor — pay for each day at the end of it.
        </p>
        <ReceiptLine fee={fee} />
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="rounded-card border border-danger-line bg-danger-surface p-4">
        <p className="font-semibold text-text">That payment did not go through</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You have not been charged. If a supervisor is still holding the job,
          paying now keeps it.
        </p>
      </div>
    );
  }

  return null;
}

/**
 * The receipt reference, when one exists.
 *
 * Not called an invoice, on the same instruction `AccessReceipt` carries: GST
 * treatment of the access fees is an open owner decision, and calling a receipt
 * reference an invoice would be this client making a tax claim. There is no
 * download, because no field carries a document.
 */
function ReceiptLine({ fee }: { fee: FeeMoneyView }) {
  if (fee.receiptNumber === null) return null;
  return (
    <p className="mt-3 text-sm text-text-muted">
      Receipt reference <span data-numeric>{fee.receiptNumber}</span> — quote it if
      you talk to us about this payment.
    </p>
  );
}
