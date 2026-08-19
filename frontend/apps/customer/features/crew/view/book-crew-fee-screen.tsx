"use client";

import {
  bookingFeePhase,
  bookingPhase,
  canCheckOutBookingFee,
  isBookingFeeNotChargeable,
  useServerCountdown,
  type BookingFeePhase,
} from "@vsolve/query";
import {
  Button,
  Disclosure,
  ErrorState,
  RailHeadline,
  RailLayout,
  RailMoney,
  Skeleton,
  buttonStyles,
  useIsWideScreen,
} from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { confirmedCrewName, toBookingView } from "../adapters";
import { useRateCardState, useStartBookingFeeCheckout } from "../queries";
import { BookingFeeDialog } from "./booking-fee-dialog";
import { ConfirmCrewScreen } from "./mobile/confirm-crew-screen";

/**
 * The booking-fee checkout — `M2-FE-428`.
 *
 * The A3 mirror of `/requests/[id]/book-visits`, on the same rails and with the
 * same three rules: it exists only against a real accepted commitment, it is a
 * **route** rather than a modal because a payment outlives the screen that
 * started it, and **nothing but a verified provider callback confirms it**.
 *
 * ## Why this can be reached before the money exists, and why leaving is safe
 *
 * A lead has accepted and is holding the job. The hold **lapses harmlessly** if
 * the Customer never pays: the lead goes back on the market, the next offer or
 * wave proceeds and nothing was charged. So arriving here and leaving is a safe
 * outcome, and the screen says so rather than pressuring.
 *
 * ## Never success from the redirect
 *
 * `POST .../booking-fee/checkout/` answers with an `AccessCheckout`, which says
 * an attempt exists and nothing more. The fee reaches `ACTIVE` — and the same
 * callback creates the engagement — only when the provider confirms. So the
 * screen polls the state read and shows a pending state with **nothing to
 * press** until the server answers, because every control that could exist there
 * is a way to pay twice.
 *
 * ## And it resolves the outcome from the aggregate, not from the attempt
 *
 * `GET /api/v1/payment-attempts/{id}/` resolves ownership through
 * `checkout__customer` and an M2 charge is created with `checkout=None`, so the
 * Customer cannot read the attempt they just created — it answers `404`. The
 * `BookingFee` on the state read is therefore the only truth available, and it
 * is also the better one: it answers from a requirement id alone, which is all a
 * Customer returning on another device has.
 *
 * ## The pay control is gated on `checkout_available`, never on a fee status
 *
 * **`BookingFee.Status.OFFER_ACCEPTED` is unreachable today.** It is the model
 * default, but `accept_crew_offer` creates no fee row at all and the only
 * construction site overwrites the status to `PENDING` before saving — recorded
 * by Session C in `frontend-execution-plan.md` §7 on 14 August. So while a lead
 * is holding the job there is **no `BookingFee` on the read at all**, and a
 * screen that offered its pay button on `awaiting_payment` would offer it never:
 * the reachable phase in exactly that moment is `none`, whose honest-looking
 * sentence is "nobody has accepted yet" — the opposite of the truth.
 *
 * `checkout_available` is the server's own answer to "is a lead holding this
 * right now, and is the fee unsettled". It is the only field that means what
 * this screen needs, so it is the only field the control turns on. The fee
 * status decides what to say *afterwards*, which is a different question.
 */

export interface BookCrewFeeScreenProps {
  requirementId: string;
  /** Back to the request. This feature owns no route. */
  requestHref: string;
}

export function BookCrewFeeScreen({ requirementId, requestHref }: BookCrewFeeScreenProps) {
  const router = useRouter();
  const isWide = useIsWideScreen();
  const rateQuery = useRateCardState(requirementId);
  const checkout = useStartBookingFeeCheckout();
  const [paying, setPaying] = useState(false);

  const state = rateQuery.data ?? null;
  const booking = state?.booking ?? null;

  // Above the early returns, because hooks are. The dialog names the remaining
  // hold in words — "held for 27 minutes" — rather than showing a second ticking
  // clock next to the one already in the top bar.
  const holdCountdown = useServerCountdown(booking?.hold_expires_at ?? null);
  const holdRemaining =
    holdCountdown === null || holdCountdown.isExpired ? null : holdCountdown.display;

  if (rateQuery.isPending) {
    return (
      <Wrapper>
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your booking</span>
          <Skeleton className="h-40 w-full" />
        </div>
      </Wrapper>
    );
  }

  if (rateQuery.isError || state === null || booking === null) {
    return (
      <Wrapper>
        <AccessRefusal
          error={rateQuery.error ?? new Error("No crew booking on this request")}
          attempting="confirm your crew"
          onRetry={() => void rateQuery.refetch()}
          inline={false}
        />
        <BackLink href={requestHref} />
      </Wrapper>
    );
  }

  const view = toBookingView(booking);
  const feePhase = bookingFeePhase(state);
  const crewName = confirmedCrewName(state);
  const isHeld = bookingPhase(state) === "offer_held";

  const checkoutAction = (
    <CheckoutAction
      phase={feePhase}
      canCheckOut={canCheckOutBookingFee(state)}
      feeLabel={view.bookingFeeLabel}
      isPending={checkout.isPending}
      onStart={() => setPaying(true)}
      requestHref={requestHref}
    />
  );

  const refusal = isBookingFeeNotChargeable(checkout.error) ? (
    // Handled here rather than through `describeError`, because
    // `m2_booking_fee_not_chargeable` is not in the frozen `errors.ts` and falls
    // through to `choose_again` — "that option is no longer available", offered
    // against nothing the Customer can choose. What actually happened is that the
    // hold lapsed between the render and the tap, and the only true next step is
    // to wait. Requested in §7.
    <ErrorState
      title="Nobody is holding this job any more"
      message="The supervisor's hold ran out while you were here, so there is nothing to pay for right now. Nothing has been charged. We are still looking for a crew at the same published rate — this page will tell you the moment somebody accepts."
      severity="warning"
      inline
    />
  ) : (
    <AccessRefusal error={checkout.error} attempting="pay the booking fee" />
  );

  const paymentDialog = (
    <BookingFeeDialog
      open={paying}
      onOpenChange={setPaying}
      feeLabel={view.bookingFeeLabel}
      leadReceiptLabel={view.leadReceiptLabel}
      holdRemaining={holdRemaining}
      isPending={checkout.isPending}
      isRetry={feePhase === "failed"}
      onConfirm={() =>
        checkout.mutate(
          {
            requirementId,
            bookingId: booking.id,
            isRetryAfterFailure: feePhase === "failed",
          },
          // Closed on both outcomes. A `201` hands off to the provider and the
          // screen behind takes over the pending state; a refusal is rendered
          // there too, because the dialog it came from is about to be replaced
          // by whatever the server now says is true.
          { onSettled: () => setPaying(false) },
        )
      }
    />
  );

  if (!isWide) {
    return (
      <>
        <ConfirmCrewScreen
          booking={view}
          crewName={crewName}
          holdRemaining={holdRemaining}
          holdAnnouncement={holdCountdown?.announce ?? null}
          dateRange={null}
          onBack={() => router.push(requestHref)}
          onPay={() => setPaying(true)}
          canPay={canCheckOutBookingFee(state) && feePhase !== "pending"}
          isPaying={checkout.isPending}
          // The phase states that have nothing to press — a charge in flight, a
          // settled fee, nobody holding — say so in the body instead of docking
          // a button that would be a way to pay twice.
          status={canCheckOutBookingFee(state) && feePhase !== "pending" ? undefined : checkoutAction}
          notice={refusal}
        />
        {paymentDialog}
      </>
    );
  }

  return (
    <Wrapper>
      {/* The countdown lives in the top bar rather than in the body, so the
          amount owns the rail. A timer beside a price competes with it, and the
          price is the thing being decided. */}
      <HoldBar holdExpiresAt={view.holdExpiresAt} isHeld={isHeld} />

      <h1 className="mt-4 text-2xl font-bold text-text">
        {isHeld ? "A supervisor accepted. Confirm to keep them." : "Confirm your crew"}
      </h1>

      <div className="mt-6">
        <RailLayout
          railLabel="Pay now to confirm"
          rail={
            <div className="flex flex-col gap-3">
              <RailHeadline
                eyebrow="Pay now to confirm"
                value={view.bookingFeeLabel}
                footnote="UPI, card or netbanking"
              />

              <CheckoutAction
                phase={feePhase}
                canCheckOut={canCheckOutBookingFee(state)}
                feeLabel={view.bookingFeeLabel}
                isPending={checkout.isPending}
                onStart={() => setPaying(true)}
                requestHref={requestHref}
              />

              {isBookingFeeNotChargeable(checkout.error) ? (
                // Handled here rather than through `describeError`, because
                // `m2_booking_fee_not_chargeable` is not in the frozen
                // `errors.ts` and falls through to `choose_again` — "that option
                // is no longer available", offered against nothing the Customer
                // can choose. What actually happened is that the hold lapsed
                // between the render and the tap, and the only true next step is
                // to wait. Requested in §7.
                <ErrorState
                  title="Nobody is holding this job any more"
                  message="The supervisor's hold ran out while you were here, so there is nothing to pay for right now. Nothing has been charged. We are still looking for a crew at the same published rate — this page will tell you the moment somebody accepts."
                  severity="warning"
                  inline
                />
              ) : (
                <AccessRefusal error={checkout.error} attempting="pay the booking fee" />
              )}

              <Disclosure summary={`What the ${view.bookingFeeLabel} is for`} hint="Fee rules">
                <p>
                  It holds this crew for your dates and is the only money we
                  collect on this job. Refunded in full if nobody arrives.
                </p>
              </Disclosure>

              <p className="text-sm leading-5 text-text-secondary">
                Wages stay between you and the crew. We only ever take this fee.
              </p>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <AcceptedCrew crewName={crewName} headcount={view.headcount} />

            <section className="rounded-card border border-line bg-surface p-5">
              <h2 className="text-sm font-bold text-text">The job you are confirming</h2>
              <p className="mt-1 text-[0.9375rem] font-semibold text-text">
                {view.headcount} {view.headcount === 1 ? "person" : "people"} ×{" "}
                {view.days} {view.days === 1 ? "day" : "days"}
              </p>

              <div className="mt-4">
                <RailMoney
                  rows={[
                    {
                      label: `${view.dayRateLabel} per person per day`,
                      amount: view.totalLabel,
                      emphasis: true,
                    },
                    {
                      label: "Cash to the crew, at day end",
                      note: `${view.leadDayReceiptLabel} at the end of each day`,
                      amount: view.leadReceiptLabel,
                    },
                  ]}
                />
              </div>

              <p className="mt-4 max-w-prose text-sm leading-6 text-text-secondary">
                The {view.leadReceiptLabel} for the work is paid straight to the
                supervisor at the end of each day — we never hold it, so payment
                for the work, any refund on it and any guarantee about it are
                between you and them.
              </p>
            </section>

            {isHeld ? (
              <p className="max-w-prose text-sm leading-6 text-text-secondary">
                Leave this and the hold lapses — we keep looking, and nothing is
                charged either way.
              </p>
            ) : null}

            <BackLink href={requestHref} />
          </div>
        </RailLayout>
      </div>

      <BookingFeeDialog
        open={paying}
        onOpenChange={setPaying}
        feeLabel={view.bookingFeeLabel}
        leadReceiptLabel={view.leadReceiptLabel}
        holdRemaining={holdRemaining}
        isPending={checkout.isPending}
        isRetry={feePhase === "failed"}
        onConfirm={() =>
          checkout.mutate(
            {
              requirementId,
              bookingId: booking.id,
              isRetryAfterFailure: feePhase === "failed",
            },
            {
              // Closed on both outcomes. A `201` hands off to the provider and
              // the screen behind takes over the pending state; a refusal is
              // rendered on that screen too, because the dialog it came from is
              // about to be replaced by whatever the server says is true now.
              onSettled: () => setPaying(false),
            },
          )
        }
      />
    </Wrapper>
  );
}

/**
 * Who accepted — as much as this screen is entitled to say.
 *
 * **The name is deliberately absent while the offer is only held.** The server
 * publishes `confirmed_partner_name` as null at every status but `CONFIRMED`,
 * because vendor identity is released by the confirmation rather than by the
 * hold — otherwise anybody who reached this screen and never paid would collect
 * the identities of the leads who accepted. So this says that *a* supervisor
 * took it, which is the true and complete answer at this moment, and the name
 * appears on the confirmed booking where the server does publish it.
 */
function AcceptedCrew({
  crewName,
  headcount,
}: {
  crewName: string | null;
  headcount: number;
}) {
  return (
    <section className="rounded-card border border-success-line bg-success-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-success-text">
          Accepted · holding for you
        </p>
      </div>
      <p className="mt-1.5 text-lg font-bold text-text">
        {crewName ?? "A supervisor accepted your job"}
      </p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        They have taken it at our published rate and are holding{" "}
        {headcount === 1 ? "one person" : `${headcount} people`} for your dates.
        {crewName === null
          ? " We will introduce them by name the moment the booking is confirmed."
          : ""}
      </p>
    </section>
  );
}

/**
 * The hold, counted down where it does not compete with the amount.
 *
 * `useServerCountdown` rather than a device clock: a phone whose time is ten
 * minutes fast would show a hold that has already lapsed, and the Customer would
 * abandon a booking that was still theirs.
 */
function HoldBar({
  holdExpiresAt,
  isHeld,
}: {
  holdExpiresAt: string | null;
  isHeld: boolean;
}) {
  const countdown = useServerCountdown(holdExpiresAt);
  if (!isHeld || countdown === null || countdown.isExpired) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-warning-line bg-warning-surface px-4 py-2.5">
      <span className="text-sm font-semibold text-text">Holding your crew</span>
      <span
        data-numeric
        className="text-sm font-bold tabular-nums text-warning-text"
        // The digits change every second; the announcement does not.
        aria-label={countdown.announce}
      >
        {countdown.display} left
      </span>
    </div>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</div>;
}

function BackLink({ href }: { href: string }) {
  return (
    <div className="mt-8">
      <Link href={href} className={buttonStyles({ variant: "ghost" })}>
        Back to this request
      </Link>
    </div>
  );
}

/**
 * The one control on this screen, and the four states in which there is none.
 *
 * Split in two deliberately. The **settled** states are read off the fee, which
 * is the record that knows them. The **payable** state is read off
 * `checkout_available`, which is the only field that knows it — see the header
 * on why a fee status cannot answer "may I pay now".
 */
function CheckoutAction({
  phase,
  canCheckOut,
  feeLabel,
  isPending,
  onStart,
  requestHref,
}: {
  phase: BookingFeePhase;
  canCheckOut: boolean;
  feeLabel: string;
  isPending: boolean;
  onStart: () => void;
  requestHref: string;
}) {
  // 1. A charge is in flight. Nothing to press — every control that could exist
  //    on a pending charge is a way to pay twice.
  if (phase === "pending") {
    return (
      <div role="status">
        <p className="font-medium text-text">We are confirming your payment</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Your bank or UPI app tells us the outcome, and that can take a few
          minutes. This page updates itself when it arrives. Do not pay again — if
          the first payment lands afterwards you would have paid the booking fee
          twice.
        </p>
      </div>
    );
  }

  // 2. Verified. Only the provider callback reaches this, and the same callback
  //    created the engagement.
  if (phase === "active" || phase === "earned") {
    return (
      <div>
        <p className="font-medium text-text">Your crew is confirmed</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Nothing more to do here. Who is coming, when they arrive and each
          day&rsquo;s settlement are all on the request itself.
        </p>
        <div className="mt-3">
          <Link href={requestHref} className={buttonStyles({ variant: "primary" })}>
            Back to this request
          </Link>
        </div>
      </div>
    );
  }

  // 3. The money already went one way or the other. The request page states which.
  if (phase === "forfeited" || phase === "refunded") {
    return (
      <p className="max-w-prose text-sm leading-6 text-text-secondary">
        This booking is already settled. What happened to the fee is on the request
        itself.
      </p>
    );
  }

  // 4. Nothing is held. True whether the Customer arrived early (no offer yet),
  //    late (the hold lapsed) or on a request that never used the instant path.
  //    Said the same way in all three, because to the Customer they are one fact.
  if (!canCheckOut) {
    return (
      <p className="max-w-prose text-sm leading-6 text-text-secondary">
        No supervisor is holding this job right now, so there is nothing to pay
        for. <strong className="font-semibold text-text">Nothing has been charged.</strong>{" "}
        We will ask you the moment one accepts.
      </p>
    );
  }

  // 5. Payable. A previous attempt may have failed — the server said so, and
  //    only then does pressing again start a genuinely new charge.
  const hasFailed = phase === "failed";
  return (
    <div>
      {hasFailed ? (
        <p className="mb-3 max-w-prose text-sm leading-6 text-text-secondary">
          <strong className="font-semibold text-text">
            That payment did not go through.
          </strong>{" "}
          You have not been charged, and the supervisor is still holding the job —
          paying now keeps it.
        </p>
      ) : null}
      <Button
        block
        size="lg"
        onClick={onStart}
        loading={isPending}
        loadingLabel="Starting your payment"
      >
        {hasFailed ? `Try again — ${feeLabel}` : `Pay ${feeLabel} and confirm`}
      </Button>
    </div>
  );
}
