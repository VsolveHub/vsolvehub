"use client";

import {
  bookingFeePhase,
  bookingPhase,
  canCheckOutBookingFee,
  isBookingFeeNotChargeable,
  useServerCountdown,
  type BookingFeePhase,
} from "@vsolve/query";
import { Badge, Button, ErrorState, Skeleton, buttonStyles, useIsWideScreen } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessRefusal } from "@/features/access/view/access-refusal";
import { confirmedCrewName, toBookingView, toRateTermsView } from "../adapters";
import { useRateCardState, useStartBookingFeeCheckout } from "../queries";
import { RateTermsLink } from "./rate-terms-sheet";

/**
 * A3 · 3 — the booking-fee checkout — `M2-FE-428`.
 *
 * The whole screen is one card: who accepted, the fee, the wage line, and one
 * button. It exists only against a real accepted commitment, keeps an
 * addressable recovery screen for the held crew, and **nothing but a verified
 * provider callback confirms it** — there is no confirmation dialog any more,
 * because a screen that is already the confirmation does not need a second one
 * stacked on top of it. Pressing the pay button starts the checkout directly.
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
 * press** until the server answers, because every control that could exist
 * there is a way to pay twice.
 *
 * ## The pay control is gated on `checkout_available`, never on a fee status
 *
 * `BookingFee.Status.OFFER_ACCEPTED` **is** reachable: `hold_booking_fee`
 * (`backend/apps/requirements/booking_fees.py`) opens the fee in that status
 * the moment a lead takes the job, so while a lead holds it the read carries a
 * fee in `awaiting_payment`. The control is still gated on `checkout_available`
 * rather than on that status, because it is the server's own answer to "is a
 * lead holding this right now, and is the fee unsettled".
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

  const state = rateQuery.data ?? null;
  const booking = state?.booking ?? null;

  const holdCountdown = useServerCountdown(booking?.hold_expires_at ?? null);
  const holdAnnouncement = holdCountdown?.announce ?? undefined;
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
  const terms = toRateTermsView(view);
  const feePhase = bookingFeePhase(state);
  const crewName = confirmedCrewName(state);
  const isHeld = bookingPhase(state) === "offer_held";

  const refusal = isBookingFeeNotChargeable(checkout.error) ? (
    // `m2_booking_fee_not_chargeable` is not in the frozen `errors.ts` and falls
    // through to `choose_again` — offered against nothing the Customer can
    // choose. What actually happened is that the hold lapsed between the render
    // and the tap, and the only true next step is to wait.
    <ErrorState
      title="Nobody is holding this job any more"
      message="The hold ran out while you were here, so there is nothing to pay for right now. Nothing has been charged. We are still looking for a crew at the same published rate."
      severity="warning"
      inline
    />
  ) : (
    <AccessRefusal error={checkout.error} attempting="pay the booking fee" />
  );

  const body = (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-success-line bg-success-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold text-text">
            {crewName ?? "A supervisor accepted"}
          </p>
          {isHeld && holdRemaining !== null ? (
            <Badge tone="success">
              Holding <span aria-label={holdAnnouncement}>{holdRemaining}</span>
            </Badge>
          ) : (
            <Badge tone="success">Holding it for you</Badge>
          )}
        </div>

        <p className="mt-3 text-sm font-semibold text-text">
          Booking fee <span data-numeric>{view.bookingFeeLabel}</span>
        </p>
        <p className="mt-0.5 text-sm leading-6 text-text-secondary">
          Now, on UPI, to Vsolve. Refunded if nobody turns up.
        </p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Then <span data-numeric>{view.leadDayReceiptLabel}</span> a day to the crew, paid
          by you each evening.
        </p>
      </div>

      <CheckoutAction
        phase={feePhase}
        canCheckOut={canCheckOutBookingFee(state)}
        feeLabel={view.bookingFeeLabel}
        isPending={checkout.isPending}
        onPay={() =>
          checkout.mutate({
            requirementId,
            bookingId: booking.id,
            isRetryAfterFailure: feePhase === "failed",
          })
        }
        requestHref={requestHref}
      />

      {refusal}

      <RateTermsLink terms={terms} />
    </div>
  );

  if (!isWide) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <button
          type="button"
          onClick={() => router.push(requestHref)}
          className="self-start text-sm font-semibold text-text-link"
        >
          ← Back
        </button>
        {body}
      </div>
    );
  }

  return <Wrapper>{body}</Wrapper>;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-md px-4 py-6">{children}</div>;
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
 * The **settled** states are read off the fee, which is the record that knows
 * them. The **payable** state is read off `checkout_available`, which is the
 * only field that knows it — see the header on why a fee status cannot answer
 * "may I pay now".
 */
function CheckoutAction({
  phase,
  canCheckOut,
  feeLabel,
  isPending,
  onPay,
  requestHref,
}: {
  phase: BookingFeePhase;
  canCheckOut: boolean;
  feeLabel: string;
  isPending: boolean;
  onPay: () => void;
  requestHref: string;
}) {
  // 1. A charge is in flight. Nothing to press — every control that could exist
  //    on a pending charge is a way to pay twice.
  if (phase === "pending") {
    return (
      <p className="text-sm leading-6 text-text" role="status">
        Confirming your payment… don&rsquo;t pay again.
      </p>
    );
  }

  // 2. Verified. Only the provider callback reaches this, and the same callback
  //    created the booking.
  if (phase === "active" || phase === "earned") {
    return (
      <div>
        <p className="text-sm font-medium text-text">Your crew is confirmed</p>
        <div className="mt-3">
          <Link href={requestHref} className={buttonStyles({ variant: "primary" })}>
            Open this booking
          </Link>
        </div>
      </div>
    );
  }

  // 3. The money already went one way or the other. The request page states which.
  if (phase === "forfeited" || phase === "refunded") {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        This booking is already settled — the request itself says what happened
        to the fee.
      </p>
    );
  }

  // 4. Nothing is held. True whether the Customer arrived early, late, or on a
  //    request that never used the instant path.
  if (!canCheckOut) {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        No one is holding this job right now, so there is nothing to pay for.
        ₹0 charged.
      </p>
    );
  }

  // 5. Payable. A previous attempt may have failed, and only then does pressing
  //    again start a genuinely new charge.
  const hasFailed = phase === "failed";
  return (
    <div>
      <Button block onClick={onPay} loading={isPending} loadingLabel="Starting your payment">
        {hasFailed ? `Try again — Pay ${feeLabel} & confirm` : `Pay ${feeLabel} & confirm`}
      </Button>
      <p className="mt-2 text-center text-xs leading-5 text-text-secondary">
        Not now — hold lapses, ₹0 charged
      </p>
    </div>
  );
}
