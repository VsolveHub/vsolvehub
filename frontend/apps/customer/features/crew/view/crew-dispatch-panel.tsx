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
import { engagementHref, engagementListHref } from "@/lib/routes";
import {
  confirmedCrewName,
  toBookingView,
  toCascadeView,
  toFeeMoneyView,
  toRateTermsView,
  type BookingView,
  type CascadeView,
  type FeeMoneyView,
  type RateTermsView,
} from "../adapters";
import {
  useCancelBooking,
  useCancelUnmatchedRequest,
  useChooseQuotesInstead,
  useRateCardState,
  useRetryCrewSearch,
  useSimulateBookingFeeCapture,
  useStartBookingFeeCheckout,
} from "../queries";
import { CascadeStrip } from "./cascade-strip";
import { MatchingScreen } from "./mobile/matching-screen";
import { NoCrewScreen } from "./mobile/no-crew-screen";
import { RateTermsLink } from "./rate-terms-sheet";

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
  const retrySearch = useRetryCrewSearch();
  const chooseQuotes = useChooseQuotesInstead();
  const cancelUnmatched = useCancelUnmatchedRequest();
  const feeCheckout = useStartBookingFeeCheckout();
  const simulateFeeCapture = useSimulateBookingFeeCapture();

  const [confirming, setConfirming] = useState<"cancel" | null>(null);

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
  const feeAttemptId = state.booking_fee?.payment_attempt_id ?? null;
  const canSimulatePendingFee =
    state.booking_fee?.simulated_capture_available === true && feeAttemptId !== null;
  const feePaymentPending = feeCheckout.isPending || simulateFeeCapture.isPending;

  const simulateCapture = (paymentAttemptId: string) => {
    simulateFeeCapture.mutate({ requirementId, paymentAttemptId });
  };

  const startFeePayment = () => {
    feeCheckout.mutate(
      {
        requirementId,
        bookingId: state.booking!.id,
        isRetryAfterFailure: feePhase === "failed",
      },
      {
        onSuccess: (checkout) => {
          if (checkout.provider === "fake") {
            simulateCapture(checkout.payment_attempt_id);
            return;
          }
          router.push(bookCrewFeeHref);
        },
      },
    );
  };

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
          cascade={toCascadeView(state.cascade ?? null)}
          terms={toRateTermsView(booking)}
          crewLine={crewLineOf(booking, requestFacts?.startsOn ?? null)}
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
        dayRateLabel={booking.dayRateLabel}
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
            terms={toRateTermsView(booking)}
          />
        </RailLayout>
      ) : null}

      {phase === "offer_held" ? (
        <OfferHeld
          booking={booking}
          holdExpiresAt={booking.holdExpiresAt}
          canCheckOut={canCheckOutBookingFee(state)}
          feePhase={feePhase}
          canSimulatePendingFee={canSimulatePendingFee}
          isPaymentPending={feePaymentPending}
          onPay={startFeePayment}
          onSimulatePending={() => {
            if (feeAttemptId !== null) simulateCapture(feeAttemptId);
          }}
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
          dayRateLabel={booking.dayRateLabel}
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
          <p className="mt-1 text-sm text-text-secondary">No crew is coming.</p>
        </div>
      ) : null}

      {fee !== null ? <FeeOutcome phase={feePhase} fee={fee} /> : null}

      {/* The frozen terms are one link away at every status after booking — a
          Customer settling a day needs the published rate they agreed to, not
          whatever the card says this week, and the explanation of it now lives
          in one sheet rather than a card repeated on every screen. */}
      {phase !== "fell_back" ? <RateTermsLink terms={toRateTermsView(booking)} /> : null}

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
        error={feeCheckout.error ?? simulateFeeCapture.error ?? cancel.error}
        attempting={
          feeCheckout.error !== null || simulateFeeCapture.error !== null
            ? "confirm this payment"
            : "update this booking"
        }
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

      {/* Arrival and no-show are recorded on the booking — `CrewDayPanel` on
          the engagement — because they name a crew, and this screen is the
          request. Nothing here opens them. */}
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
  terms,
}: {
  booking: BookingView;
  cascade: CascadeView | null;
  terms: RateTermsView;
}) {
  return (
    <div className="flex flex-col gap-3" role="status">
      <div>
        <h2 className="text-xl font-bold text-text">Finding your crew</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {booking.headcount} {booking.headcount === 1 ? "person" : "people"} ·{" "}
          {booking.days} {booking.days === 1 ? "day" : "days"}
        </p>
      </div>

      {cascade !== null && cascade.hasOffersOut ? (
        <p className="text-[0.9375rem] leading-6 text-text">
          {cascade.offersOut} {cascade.offersOut === 1 ? "supervisor" : "supervisors"} nearby{" "}
          {cascade.offersOut === 1 ? "has" : "have"} this. First to accept gets it.
        </p>
      ) : null}

      {cascade !== null ? <CascadeStrip cascade={cascade} /> : null}

      <p className="text-sm font-semibold text-text">₹0 charged so far</p>

      <p className="text-sm leading-6 text-text-secondary">
        We&rsquo;ll message you when someone accepts. You can close this.
      </p>

      <div>
        <RateTermsLink terms={terms} />
      </div>
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
          No crew will come.{" "}
          <strong className="font-semibold">
            Inside the free window the {feeLabel} fee comes back in full
          </strong>
          ; after it, the fee is forfeited. We tell you which as soon as you confirm.
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

      <p className="text-sm font-semibold text-text">₹0 charged so far</p>

      {onCancel !== null ? (
        <Button variant="ghost" onClick={onCancel} disabled={isCancelling}>
          Cancel this request
        </Button>
      ) : null}
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
      <p className="mt-2 text-sm leading-6 text-text">
        Professionals will now send you their own quotes and you choose one.
      </p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        <strong className="font-semibold text-text">Nothing has been charged.</strong>
      </p>
      <div className="mt-2">
        <Disclosure summary="What happened?">
          We widened the search{" "}
          {booking.wave > 1 ? `${booking.wave} times` : "as far as we could"} and no
          supervisor took the job at the published rate. Rather than promise a crew we
          cannot confirm, we moved this request to the quote route. Your request, dates
          and everything you told us carried across.
        </Disclosure>
      </div>
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
  feePhase,
  canSimulatePendingFee,
  isPaymentPending,
  onPay,
  onSimulatePending,
}: {
  booking: BookingView;
  holdExpiresAt: string | null;
  canCheckOut: boolean;
  feePhase: BookingFeePhase;
  canSimulatePendingFee: boolean;
  isPaymentPending: boolean;
  onPay: () => void;
  onSimulatePending: () => void;
}) {
  const countdown = useServerCountdown(holdExpiresAt);
  const terms = toRateTermsView(booking);

  return (
    <div className="rounded-card border border-success-line bg-success-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-text">A supervisor accepted</p>
        {countdown !== null && !countdown.isExpired ? (
          <Badge tone="success">
            Holding {booking.headcount === 1 ? "1 person" : `${booking.headcount} people`}{" "}
            <span aria-label={countdown.announce}>{countdown.display}</span>
          </Badge>
        ) : (
          <Badge tone="success">Holding it for you</Badge>
        )}
      </div>

      <p className="mt-3 text-sm font-semibold text-text">
        Booking fee <span data-numeric>{booking.bookingFeeLabel}</span>
      </p>
      <p className="mt-0.5 text-sm leading-6 text-text-secondary">
        Now, on UPI, to Vsolve. Refunded if nobody turns up.
      </p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Then <span data-numeric>{booking.leadDayReceiptLabel}</span> a day to the crew, paid
        by you each evening.
      </p>

      {feePhase === "pending" && canSimulatePendingFee ? (
        <div className="mt-3">
          <Button
            onClick={onSimulatePending}
            loading={isPaymentPending}
            loadingLabel="Marking payment as paid"
          >
            Mark as paid
          </Button>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Development payment simulator
          </p>
        </div>
      ) : feePhase === "pending" ? (
        <p className="mt-3 text-sm leading-6 text-text" role="status">
          Confirming your payment… don&rsquo;t pay again.
        </p>
      ) : canCheckOut ? (
        <div className="mt-3">
          <Button
            onClick={onPay}
            loading={isPaymentPending}
            loadingLabel="Confirming payment"
          >
            {feePhase === "failed"
              ? "Pay again"
              : `Pay ${booking.bookingFeeLabel} & confirm`}
          </Button>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Not now — hold lapses, ₹0 charged
          </p>
        </div>
      ) : null}

      <div className="mt-3">
        <RateTermsLink terms={terms} />
      </div>
    </div>
  );
}

/**
 * A confirmed booking, said once — and then handed over — screen 4.
 *
 * This used to be the beginning of a long screen: the crew, the money, the day
 * controls, the fee outcome and the frozen rate terms, all on `/requests/[id]`.
 * That is the wrong screen for every one of them. A request is what the Customer
 * asked for and its job ends when somebody accepts; a booking is what is
 * happening, and it is where a Customer goes to act.
 *
 * So this is one line and one button. `FeeOutcome` and the rate-terms link
 * render beside this from the panel above, not inside it — the spec's "below
 * it nothing except `FeeOutcome` ... and Rate & terms".
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text">
          <span aria-hidden>✅</span> Booked · {crewName ?? "A supervisor"} ·{" "}
          {booking.headcount === 1 ? "1 person" : `${booking.headcount} people`}
        </p>
        <Link
          href={
            engagementId === null ? engagementListHref("lead_only") : engagementHref(engagementId)
          }
          className={buttonStyles({ variant: "outline", size: "sm" })}
        >
          Open booking
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Where the money went

   Day one lives in `features/engagement/view/today-card.tsx`. Recording an
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
        <p className="mt-2 text-sm leading-6 text-text">
          The crew travelled and could not work, so the fee was split:
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
        <p className="mt-2 text-sm leading-6 text-text">
          It reaches your account the way you paid it.
        </p>
        <ReceiptLine fee={fee} />
      </div>
    );
  }

  if (phase === "earned") {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="font-semibold text-text">Your crew arrived</p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          The {fee.amountLabel} booking fee is settled; pay the crew each day directly.
        </p>
        <ReceiptLine fee={fee} />
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="rounded-card border border-danger-line bg-danger-surface p-4">
        <p className="font-semibold text-text">That payment did not go through</p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          You have not been charged — pay now to keep the crew.
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
      Receipt <span data-numeric>{fee.receiptNumber}</span>
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
  dayRateLabel,
  isPending,
  error,
  onRetry,
  onChooseQuotes,
  onCancel,
  supportAction,
}: {
  dayRateLabel: string;
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
      <div className="flex flex-col items-center gap-1 py-2 text-center">
        <span aria-hidden className="text-2xl">
          😕
        </span>
        <p className="font-semibold text-text">No one free at this rate</p>
        <p className="text-sm text-text-secondary">Nothing charged.</p>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Button block onClick={onRetry} loading={isPending} loadingLabel="Widening the search">
          Search wider (same rate)
        </Button>
        <Button block variant="secondary" onClick={onChooseQuotes} disabled={isPending}>
          Get quotes instead
        </Button>
        <Button
          block
          variant="ghost"
          onClick={() => setConfirmingCancel(true)}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>

      <div className="mt-3">
        <Disclosure summary="What &ldquo;quotes instead&rdquo; means">
          Professionals send their own price instead of the published{" "}
          {dayRateLabel} day rate. It is slower, and nothing is charged to ask for one.
        </Disclosure>
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
        consequence="Nothing has been charged and nothing will be."
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

/** "4 people · 3 days · from Mon" — the waiting screen's one summary line. */
function crewLineOf(booking: BookingView, startsOn: string | null): string {
  const people = `${booking.headcount} ${booking.headcount === 1 ? "person" : "people"}`;
  const days = `${booking.days} ${booking.days === 1 ? "day" : "days"}`;
  return startsOn === null ? `${people} · ${days}` : `${people} · ${days} · from ${startsOn}`;
}
