"use client";

import {
  bookingFeePhase,
  bookingPhase,
  canCheckOutBookingFee,
  isBookingFeeNotChargeable,
  type BookingFeePhase,
} from "@vsolve/query";
import { Button, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { confirmedCrewName, toBookingView } from "../adapters";
import { useRateCardState, useStartBookingFeeCheckout } from "../queries";

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
  const rateQuery = useRateCardState(requirementId);
  const checkout = useStartBookingFeeCheckout();

  const state = rateQuery.data ?? null;
  const booking = state?.booking ?? null;

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

  return (
    <Wrapper>
      <h1 className="text-xl font-semibold text-text">Confirm your crew</h1>

      {bookingPhase(state) === "offer_held" ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          A supervisor has accepted this job at the published rate and is{" "}
          <strong className="font-semibold text-text">holding it for you</strong>{" "}
          while you finish here. If you do not pay, the hold lapses and we keep
          looking — nothing is charged either way.
        </p>
      ) : null}

      {crewName !== null ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Your crew is from{" "}
          <strong className="font-semibold text-text">{crewName}</strong>.
        </p>
      ) : null}

      <dl className="mt-4 rounded-card border border-line bg-surface">
        <div className="flex items-baseline justify-between gap-3 border-b border-line p-4">
          <dt className="text-sm text-text-secondary">
            {view.headcount} {view.headcount === 1 ? "person" : "people"} for{" "}
            {view.days} {view.days === 1 ? "day" : "days"} at {view.dayRateLabel} each
            per day
          </dt>
          <dd data-numeric className="font-medium text-text">
            {view.totalLabel}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-b border-line p-4">
          <dt className="text-sm text-text-secondary">
            Paid to the crew directly, at the end of each day
          </dt>
          <dd data-numeric className="font-medium text-text">
            {view.leadReceiptLabel}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 p-4">
          <dt className="font-semibold text-text">Booking fee to pay now</dt>
          <dd data-numeric className="text-lg font-semibold text-text">
            {view.bookingFeeLabel}
          </dd>
        </div>
      </dl>

      <p className="mt-4 max-w-prose text-sm leading-6 text-text-secondary">
        This booking fee is the{" "}
        <strong className="font-semibold text-text">only money Vsolve collects</strong>{" "}
        on this job. The {view.leadReceiptLabel} for the work is paid straight to
        the supervisor at the end of each day — we never hold it, so payment for
        the work, any refund on it and any guarantee about it are between you and
        them.
      </p>

      <div className="mt-6">
        <CheckoutAction
          phase={feePhase}
          canCheckOut={canCheckOutBookingFee(state)}
          feeLabel={view.bookingFeeLabel}
          isPending={checkout.isPending}
          onStart={() =>
            checkout.mutate({
              requirementId,
              bookingId: booking.id,
              isRetryAfterFailure: feePhase === "failed",
            })
          }
          requestHref={requestHref}
        />
      </div>

      <div className="mt-4">
        {isBookingFeeNotChargeable(checkout.error) ? (
          // Handled here rather than through `describeError`, because
          // `m2_booking_fee_not_chargeable` is not in the frozen `errors.ts` and
          // falls through to `choose_again` — "that option is no longer
          // available", offered against nothing the Customer can choose. What
          // actually happened is that the hold lapsed between the render and the
          // tap, and the only true next step is to wait. Requested in §7.
          <ErrorState
            title="Nobody is holding this job any more"
            message="The supervisor's hold ran out while you were here, so there is nothing to pay for right now. Nothing has been charged. We are still looking for a crew at the same published rate — this page will tell you the moment somebody accepts."
            severity="warning"
            inline
          />
        ) : (
          <AccessRefusal error={checkout.error} attempting="pay the booking fee" />
        )}
      </div>

      <BackLink href={requestHref} />
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6">{children}</div>;
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
      <Button onClick={onStart} loading={isPending} loadingLabel="Starting your payment">
        {hasFailed ? `Try again — ${feeLabel}` : `Pay ${feeLabel} and confirm the crew`}
      </Button>
    </div>
  );
}
