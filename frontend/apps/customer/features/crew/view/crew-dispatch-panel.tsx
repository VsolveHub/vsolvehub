"use client";

import {
  bookingFeePhase,
  bookingPhase,
  canCancelBooking,
  canCheckOutBookingFee,
  useServerCountdown,
  type BookingFeePhase,
  type RateCardBookingPhase,
} from "@vsolve/query";
import {
  Badge,
  Button,
  ConfirmAction,
  Disclosure,
  RailLayout,
  RailMoney,
  Skeleton,
  buttonStyles,
  useIsWideScreen,
} from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
// Imported rather than taken as a prop, unlike `bookCrewFeeHref`: this
// destination is not a function of any record — every A3 engagement lands in the
// same list — and `lib/routes` exists precisely so both sides of the
// server/client boundary can name a route without a function crossing it.
import { BROWSE_HREF, engagementHref, engagementListHref } from "@/lib/routes";
import {
  confirmedCrewName,
  toBookingView,
  toCascadeView,
  toFeeMoneyView,
  type BookingView,
  type CascadeView,
  type FeeMoneyView,
} from "../adapters";
import {
  useCancelBooking,
  useCancelUnmatchedRequest,
  useChooseQuotesInstead,
  useConfirmCrewArrival,
  useRateCardState,
  useReportCrewNoShow,
  useRetryCrewSearch,
} from "../queries";
import { CascadeStrip } from "./cascade-strip";
import { MatchingScreen } from "./mobile/matching-screen";
import { NoCrewScreen } from "./mobile/no-crew-screen";
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
  /**
   * The request's own facts, for the waiting screen's rail.
   *
   * Passed in already resolved rather than read here. The address is an id on
   * the requirement and the dates are the Customer's answers — both belong to
   * the request record, which the screen above already holds, and a second query
   * from inside this panel would be a second place they can disagree.
   *
   * Optional throughout: the rail renders whichever facts it was given and omits
   * the rest, because a summary is a convenience and a panel that refused to
   * render without one would take the crew status down with it.
   */
  requestFacts?: { addressLine: string | null; startsOn: string | null };
  /** The service being booked. Titles the phone screens' own header. */
  serviceName?: string;
}

export function CrewDispatchPanel({
  requirementId,
  bookCrewFeeHref,
  supportAction,
  requestFacts,
  serviceName = "Your request",
}: CrewDispatchPanelProps) {
  const router = useRouter();
  const isWide = useIsWideScreen();
  const rateQuery = useRateCardState(requirementId);
  const cancel = useCancelBooking();
  const arrival = useConfirmCrewArrival();
  const noShow = useReportCrewNoShow();
  const retrySearch = useRetryCrewSearch();
  const chooseQuotes = useChooseQuotesInstead();
  const cancelUnmatched = useCancelUnmatchedRequest();

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

  /**
   * On a phone, two of these phases are whole screens rather than panels.
   *
   * Waiting for a crew and running out of crews are both single-purpose moments
   * with one control, and on a small viewport they read far better as the screen
   * than as a card three sections down a request page — which is where the
   * customer currently meets them, under a header, a status notice and a
   * timeline. Rendering them through `MobileScreen` also takes the site
   * navigation away, so the flow stops offering six ways out of itself.
   *
   * Every other phase stays a panel at every width: they are short, and a
   * confirmed booking genuinely is one part of a request page rather than the
   * whole of it.
   */
  if (!isWide && phase === "matching") {
    return (
      <>
        <MatchingScreen
          serviceName={serviceName}
          booking={booking}
          cascade={toCascadeView(state.cascade ?? null)}
          addressLine={requestFacts?.addressLine ?? null}
          startsOn={requestFacts?.startsOn ?? null}
          editHref={`/requests/${requirementId}`}
          onBack={() => router.push("/requests")}
          onCancel={canCancelBooking(state) ? () => setConfirming("cancel") : undefined}
          isCancelling={cancel.isPending}
          notice={<AccessRefusal error={cancel.error} attempting="cancel this request" />}
        />
        {/* Mounted here too, because this branch returns before the panel's own
            copy. `<dialog>` renders in the top layer, so it is unaffected by the
            screen's sticky header and footer. */}
        <CancelBookingConfirm
          open={confirming === "cancel"}
          onOpenChange={(open) => setConfirming(open ? "cancel" : null)}
          feeLabel={booking.bookingFeeLabel}
          onConfirm={() => {
            cancel.mutate({ requirementId });
            setConfirming(null);
          }}
          isPending={cancel.isPending}
        />
      </>
    );
  }

  if (!isWide && phase === "exhausted") {
    return (
      <NoCrewScreen
        serviceName={serviceName}
        booking={booking}
        onBack={() => router.push("/requests")}
        onSearchWider={() => retrySearch.mutate({ requirementId })}
        onGetQuotes={() => chooseQuotes.mutate({ requirementId })}
        onCancel={() => cancelUnmatched.mutate({ requirementId })}
        isPending={
          retrySearch.isPending || chooseQuotes.isPending || cancelUnmatched.isPending
        }
        notice={
          <AccessRefusal
            error={retrySearch.error ?? chooseQuotes.error ?? cancelUnmatched.error}
            attempting="keep looking for a crew"
            supportAction={supportAction}
          />
        }
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {/* The waiting screen is the one phase with a rail: it is the only moment
          where the Customer is reading a status and a price side by side and
          neither is a control. Every other phase is a single decision — pay,
          confirm, cancel — and a summary column beside a one-button screen is
          furniture. */}
      {phase === "matching" ? (
        <RailLayout
          railLabel="Your request"
          railWidth="20rem"
          rail={
            <WaitingRail
              booking={booking}
              requestFacts={requestFacts}
              onCancel={canCancelBooking(state) ? () => setConfirming("cancel") : null}
              isCancelling={cancel.isPending}
            />
          }
        >
          <CascadeHolding
            booking={booking}
            cascade={toCascadeView(state.cascade ?? null)}
            requirementId={requirementId}
          />
        </RailLayout>
      ) : null}

      {phase === "offer_held" ? (
        <OfferHeld
          booking={booking}
          holdExpiresAt={booking.holdExpiresAt}
          canCheckOut={canCheckOutBookingFee(state)}
          bookCrewFeeHref={bookCrewFeeHref}
          feePhase={feePhase}
        />
      ) : null}

      {phase === "confirmed" ? (
        <CrewConfirmed
          booking={booking}
          crewName={crewName}
          engagementId={state.engagement_id ?? null}
        />
      ) : null}

      {phase === "exhausted" ? (
        <NobodyAccepted
          booking={booking}
          isPending={
            retrySearch.isPending || chooseQuotes.isPending || cancelUnmatched.isPending
          }
          error={retrySearch.error ?? chooseQuotes.error ?? cancelUnmatched.error}
          onRetry={() => retrySearch.mutate({ requirementId })}
          onChooseQuotes={() => chooseQuotes.mutate({ requirementId })}
          onCancel={() => cancelUnmatched.mutate({ requirementId })}
          supportAction={supportAction}
        />
      ) : null}

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
            leadDayReceiptLabel: booking.leadDayReceiptLabel,
            bookingFeeLabel: booking.bookingFeeLabel,
            standardDayHours: booking.standardDayHours,
            overtimeHourlyLabel: booking.overtimeHourlyLabel,
            inclusions: booking.inclusions,
            addOns: booking.addOns,
          }}
          isBooked
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

      <CancelBookingConfirm
        open={confirming === "cancel"}
        onOpenChange={(open) => setConfirming(open ? "cancel" : null)}
        feeLabel={booking.bookingFeeLabel}
        onConfirm={() => {
          cancel.mutate({ requirementId });
          setConfirming(null);
        }}
        isPending={cancel.isPending}
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
function CascadeHolding({
  booking,
  cascade,
  requirementId,
}: {
  booking: BookingView;
  cascade: CascadeView | null;
  requirementId: string;
}) {
  return (
    <div className="flex flex-col gap-5" role="status">
      <div>
        <h2 className="text-xl font-bold text-text">Finding your crew</h2>
        <p className="mt-1 text-sm text-text-secondary">Usually within 2 hours</p>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-6 text-text">
          {cascade !== null && cascade.hasOffersOut
            ? `${cascade.offersOut} ${
                cascade.offersOut === 1 ? "supervisor" : "supervisors"
              } nearby ${cascade.offersOut === 1 ? "has" : "have"} this job. The first to accept gets it.`
            : `We have sent this to supervisors who can field ${
                booking.headcount === 1 ? "one person" : `${booking.headcount} people`
              } at our published rate. The first one to accept gets it.`}
        </p>
      </div>

      {cascade !== null ? (
        <div>
          <CascadeStrip cascade={cascade} />
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            We widen the search on our own. The rate never changes to find someone.
          </p>
        </div>
      ) : null}

      <WhileYouWait requirementId={requirementId} />
    </div>
  );
}

/**
 * The cancel confirmation, extracted so both layouts can mount it.
 *
 * The phone's waiting screen returns early — it is a whole screen rather than a
 * panel — so a dialog left further down this component would never render there.
 * Its Cancel would set state and produce nothing, which is worse than no button.
 *
 * Both outcomes are stated because the client does not know which applies: the
 * free-cancellation window is server configuration and the server decides.
 */
function CancelBookingConfirm({
  open,
  onOpenChange,
  feeLabel,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feeLabel: string;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <ConfirmAction
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel this crew booking"
      consequence={
        <>
          No crew will come. There is a free-cancellation window that runs until a
          set number of hours before your start date —{" "}
          <strong className="font-semibold">
            cancel inside it and the {feeLabel} booking fee comes back to you in
            full
          </strong>
          . Cancel after it and the fee is forfeited: part of it pays the
          supervisor for turning other work down, and the rest is ours. We will
          tell you exactly which happened as soon as you confirm.
        </>
      }
      confirmLabel="Cancel the booking"
      onConfirm={onConfirm}
      pending={isPending}
      destructive
    />
  );
}

/**
 * What the Customer asked for, what it comes to, and the one control.
 *
 * The money here is the **booking's own frozen figures**, not a live rate read:
 * this booking was made at a published card and reconciles against the number it
 * was made at, and a rail showing this week's card beside last week's booking is
 * how a Customer is told a price they never agreed to.
 *
 * "Nothing charged yet" is the load-bearing line and it is not behind a
 * disclosure. Somebody watching a search they cannot influence, on a screen with
 * a Cancel button, needs to know that walking away costs nothing before they
 * reach for it.
 */
function WaitingRail({
  booking,
  requestFacts,
  onCancel,
  isCancelling,
}: {
  booking: BookingView;
  requestFacts?: { addressLine: string | null; startsOn: string | null };
  onCancel: (() => void) | null;
  isCancelling: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card border border-line bg-surface p-4">
        <h3 className="text-sm font-bold text-text">Your request</h3>
        <dl className="mt-2 flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-text-secondary">Crew</dt>
            <dd className="text-right font-medium text-text">
              {booking.headcount} {booking.headcount === 1 ? "person" : "people"} ·{" "}
              {booking.days} {booking.days === 1 ? "day" : "days"}
            </dd>
          </div>
          {requestFacts?.startsOn ? (
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">From</dt>
              <dd className="text-right font-medium text-text">{requestFacts.startsOn}</dd>
            </div>
          ) : null}
          {requestFacts?.addressLine ? (
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Where</dt>
              <dd className="text-right font-medium text-text">{requestFacts.addressLine}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <RailMoney
        rows={[
          {
            label: `${booking.dayRateLabel} per person per day`,
            amount: booking.totalLabel,
            emphasis: true,
          },
          {
            label: "Cash to the crew",
            note: `${booking.leadDayReceiptLabel} at the end of each day`,
            amount: booking.leadReceiptLabel,
          },
        ]}
      />

      <div className="rounded-card border border-success-line bg-success-surface p-4">
        <p className="text-sm font-bold text-text">Nothing charged yet.</p>
        <p className="mt-0.5 text-sm leading-5 text-text-secondary">
          {booking.bookingFeeLabel} when someone accepts, nothing if nobody does.
        </p>
      </div>

      <p className="text-sm leading-5 text-text-secondary">
        We will text and email you the moment a crew is confirmed. You can close
        this page.
      </p>

      {onCancel !== null ? (
        <Button variant="ghost" onClick={onCancel} disabled={isCancelling}>
          Cancel this request
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Two things to do on a screen whose whole point is that there is nothing to do.
 *
 * A page with one button on it makes that button the answer to every impulse,
 * and here the only button used to be **Cancel this request** — offered to
 * somebody whose actual feeling is impatience, not regret. These absorb it:
 * both are useful, neither is required, and the heading says so before either is
 * read.
 *
 * They are links rather than buttons because both go somewhere, which keeps
 * middle-click and open-in-new-tab working.
 */
function WhileYouWait({ requirementId }: { requirementId: string }) {
  return (
    <section aria-labelledby="while-you-wait" className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="while-you-wait" className="text-sm font-bold text-text">
          While you wait
        </h3>
        <span className="text-xs text-text-muted">Nothing here is required</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link
          href={`/requests/${requirementId}#details`}
          className="rounded-control border border-line-strong bg-surface p-3 transition-colors duration-fast hover:bg-surface-hover"
        >
          <span className="block text-sm font-semibold text-text">Add site instructions</span>
          <span className="mt-0.5 block text-sm text-text-secondary">
            Gate, parking, who to ask for
          </span>
        </Link>
        <Link
          href={BROWSE_HREF}
          className="rounded-control border border-line-strong bg-surface p-3 transition-colors duration-fast hover:bg-surface-hover"
        >
          <span className="block text-sm font-semibold text-text">Book another crew</span>
          <span className="mt-0.5 block text-sm text-text-secondary">
            Different job, same address
          </span>
        </Link>
      </div>
    </section>
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

/**
 * A confirmed booking, said once — and then handed over.
 *
 * This used to be the beginning of a long screen: the crew, the money, the day
 * controls, the fee outcome and the frozen rate terms, all on `/requests/[id]`.
 * That is the wrong screen for every one of them. A request is what the Customer
 * asked for and its job ends when somebody accepts; a booking is what is
 * happening, and it is where a Customer goes to act.
 *
 * So this states the outcome in two sentences and links to the booking. The
 * explanation of how paying the crew works moves behind a disclosure, because a
 * Customer re-reading a confirmed request is checking who is coming and when,
 * not re-learning the settlement model.
 */
function CrewConfirmed({
  booking,
  crewName,
  engagementId,
}: {
  booking: BookingView;
  crewName: string | null;
  engagementId: string | null;
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

      {/* Stays open, deliberately. That Vsolve does not hold the money for the
          work is the one thing an A3 Customer must know before anybody starts,
          and a promise nobody expanded is a promise nobody read. */}
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        You pay them{" "}
        <strong className="font-semibold text-text">{booking.leadReceiptLabel}</strong> directly, at
        the end of each day. We never hold that money.
      </p>

      <div className="mt-2">
        <Disclosure summary="How does paying them work?">
          Agree the day rate with the supervisor before work starts — it is the
          published rate on your booking and they may not charge above it. Pay at
          the end of each day, in cash or however you both agree. V Solve Hub is
          not part of that payment, so keep your own record of what you have
          handed over.
        </Disclosure>
      </div>

      {/* Deep-links at last. `RateCardState` published no engagement id until
          1.36.0, so this could only offer the whole list — and everything the
          Customer now wants after confirmation lives on the booking. Falls back
          to the list when the id is absent, which is the brief window between a
          verified fee and the engagement row it creates. */}
      <div className="mt-3">
        <Link
          href={
            engagementId === null ? engagementListHref("lead_only") : engagementHref(engagementId)
          }
          className={buttonStyles({ variant: "outline" })}
        >
          Open this booking
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Where the money went

   Day one moved to `features/engagement/view/crew-day-panel.tsx`. Recording an
   arrival needs to name a booking, and this screen is the request.
   -------------------------------------------------------------------------- */

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

/**
 * Nobody accepted, and the request is now waiting on the Customer — `EXHAUSTED`.
 *
 * ## Why this screen exists at all
 *
 * The cascade used to answer this moment by itself: it handed the request to the
 * quote flow and sent a notification saying so. That is a different product —
 * vendors naming their own prices on a business-hours clock, instead of one
 * published day rate answered in minutes — and switching somebody onto it
 * without asking is a decision the platform was making on their behalf.
 *
 * So the cascade stops, changes nothing, and this offers the three real options.
 *
 * ## Why none of them is "pay more"
 *
 * It is the obvious fourth button and it cannot be built honestly. The A3 day
 * rate is an Operations-published card sitting above a statutory wage floor, and
 * the wage half of it is handed to the crew **directly, in cash, at day end** —
 * money this platform never touches. A premium added here would be a promise
 * Vsolve advertises and cannot route, enforce, or refund, on top of the standing
 * rule that a partner may never charge above the card. If supply genuinely
 * cannot be met at the published price, that is Operations' card to re-publish,
 * with a wage floor behind the decision.
 *
 * Reaching further is the honest version of the same intent, and usually the
 * correct diagnosis: thin supply at this width, not a price nobody will work for.
 *
 * ## The order of the three
 *
 * Keep looking first, because it is the only one that still gets the Customer
 * what they actually came for. Cancel is last and quiet — it is the destructive
 * one, and a request that took two minutes to describe should not be one
 * mis-tap from gone.
 */
function NobodyAccepted({
  booking,
  isPending,
  error,
  onRetry,
  onChooseQuotes,
  onCancel,
  supportAction,
}: {
  booking: BookingView;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  onChooseQuotes: () => void;
  onCancel: () => void;
  supportAction?: ReactNode;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  return (
    <div className="rounded-card border border-warning-line bg-warning-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-text">No crew accepted yet</p>
        <Badge tone="warning">Waiting on you</Badge>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-6 text-text">
        We asked every supervisor who could field{" "}
        {booking.headcount === 1 ? "one person" : `${booking.headcount} people`} near
        you, and none of them took it. That happens most often when the dates are
        close or the crew is large.
      </p>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        <strong className="font-semibold text-text">Nothing has been charged</strong>{" "}
        and your request is exactly as you left it. Three ways forward:
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <Button onClick={onRetry} loading={isPending} loadingLabel="Widening the search">
            Keep looking — search wider
          </Button>
          <p className="mt-1 max-w-prose text-xs leading-5 text-text-secondary">
            Goes out to supervisors further away, at the same {booking.dayRateLabel}{" "}
            published rate. We do not raise the price to find someone — the rate is
            set for your city, and the crew is paid it directly.
          </p>
        </div>

        <div>
          <Button variant="secondary" onClick={onChooseQuotes} disabled={isPending}>
            Get quotes instead
          </Button>
          <p className="mt-1 max-w-prose text-xs leading-5 text-text-secondary">
            Vendors send you their own prices for this job. Slower than instant
            booking, and the price will vary.
          </p>
        </div>

        <div>
          <Button variant="ghost" onClick={() => setConfirmingCancel(true)} disabled={isPending}>
            Cancel this request
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <AccessRefusal
          error={error}
          attempting="update your request"
          supportAction={supportAction}
        />
      </div>

      <ConfirmAction
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title="Cancel this request?"
        consequence="Nothing has been charged and nothing will be. You can ask again later, though you would need to describe the job once more."
        confirmLabel="Cancel the request"
        cancelLabel="Keep it open"
        onConfirm={() => {
          onCancel();
          setConfirmingCancel(false);
        }}
        pending={isPending}
        destructive
      />
    </div>
  );
}
