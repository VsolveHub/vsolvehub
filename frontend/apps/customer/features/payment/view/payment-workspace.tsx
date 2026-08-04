"use client";

import { describeError, useServerCountdown } from "@vsolve/query";
import { Badge, Button, ErrorState, Skeleton } from "@vsolve/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useBookingGroup } from "@/features/bookings/queries";
import { Money } from "@/features/booking/group/view/money";

import { paymentPhase, canReconcile, type PaymentAttempt } from "../model/outcome";
import { handoffTarget, openProviderCheckout } from "../model/provider-handoff";
import {
  isNoAttemptStarted,
  isProviderUnreachable,
  serverNow,
  useCheckoutPayment,
  useReconcilePayment,
  useStartPayment,
} from "../queries";

/**
 * The payment screen for one Booking Group.
 *
 * ## Where it gets the checkout from
 *
 * The group. Contract 1.14.0 publishes `checkout_id`, `checkout_version` and
 * `order_id` on the group projection precisely so this screen can exist as a
 * route rather than as a step trapped in the tab that confirmed the booking.
 * Everything here survives a reload, a second device and a notification link.
 *
 * ## What it refuses to render
 *
 * A success it has not read from Django. The provider widget closing means
 * nothing at all — see `model/provider-handoff.ts` — so every outcome on screen
 * comes from a polled `GET /payment-attempts/{id}/`, and the widget's callbacks
 * only trigger a re-read.
 *
 * It also renders no amount it computed. Every figure is a server `Money` value.
 */

const BUSINESS_NAME = "Vsolve Hub";

function PaymentSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-11 w-40" />
    </div>
  );
}

/** Per-unit allocations, exactly as Django split them. */
function AllocationList({ attempt }: { attempt: PaymentAttempt }) {
  if (attempt.allocations.length === 0) return null;

  return (
    <ul className="mt-4 flex flex-col gap-1 text-sm">
      {attempt.allocations.map((allocation) => (
        <li key={allocation.id} className="flex justify-between gap-3">
          <span className="text-text-secondary">Visit {allocation.position + 1}</span>
          <span className="shrink-0 tabular-nums text-text-secondary">
            <Money value={allocation.amount} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PaymentWorkspace({ groupId }: { groupId: string }) {
  const groupQuery = useBookingGroup(groupId);
  const group = groupQuery.data ?? null;
  const checkoutId = group?.checkout_id ?? null;

  const attemptQuery = useCheckoutPayment(checkoutId);
  const startPayment = useStartPayment();
  const reconcile = useReconcilePayment();

  /**
   * The widget is open. Tracked so the page cannot offer a second handoff over
   * the top of the first — two provider sessions against one order is how a
   * customer ends up staring at two dialogs and trusting whichever closes last.
   */
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  // `useStartPayment` writes the created attempt straight into the checkout key,
  // so the poll picks it up without a second round trip.
  const attempt = attemptQuery.data ?? startPayment.data ?? null;
  const countdown = useServerCountdown(attempt?.expires_at ?? null);

  const refreshAttempt = useCallback(() => {
    void attemptQuery.refetch();
    void groupQuery.refetch();
  }, [attemptQuery, groupQuery]);

  /**
   * Re-read when the tab comes back.
   *
   * The provider can take the customer out of the page entirely — a bank's 3-D
   * Secure page, a UPI app. Returning to a screen showing the state from before
   * they left is the single most confusing thing this surface could do.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAttempt();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshAttempt]);

  async function handlePay(current: PaymentAttempt) {
    const target = handoffTarget(current);
    if (target === null) {
      setHandoffError(
        "This payment cannot be opened in your browser. Please contact support with this page open.",
      );
      return;
    }

    setHandoffError(null);
    setIsHandingOff(true);
    try {
      await openProviderCheckout(target, { businessName: BUSINESS_NAME });
    } catch (error) {
      setHandoffError(
        error instanceof Error
          ? error.message
          : "The payment provider could not be opened. Please try again.",
      );
    } finally {
      setIsHandingOff(false);
      // Unconditional, on both the success and the dismiss path. Django is the
      // only thing that knows what happened, and it knows it either way.
      refreshAttempt();
    }
  }

  if (groupQuery.isPending) return <PaymentSkeleton />;

  if (group === null) {
    return (
      <ErrorState
        severity="warning"
        title="We could not open this booking"
        message={
          groupQuery.isError
            ? describeError(groupQuery.error, "read").message
            : "This booking could not be found."
        }
        actionLabel="Back to my bookings"
        onAction={() => undefined}
      />
    );
  }

  // The server decides whether payment is due. Inferring it from the status
  // string would be a second implementation of a rule Django already owns.
  if (group.recovery_action !== "PAYMENT_REQUIRED" && group.order_id === null) {
    return (
      <ErrorState
        severity="info"
        title="This booking is not waiting for payment"
        message="Nothing is due right now. Your booking page has the current status."
        actionLabel="Back to this booking"
        onAction={() => undefined}
      />
    );
  }

  if (checkoutId === null) {
    // 1.14.0 guarantees a checkout on a group that says PAYMENT_REQUIRED. If it
    // is ever null here, saying so beats rendering a button built on a guess.
    return (
      <ErrorState
        severity="warning"
        title="We cannot open payment for this booking"
        message="The booking exists but we could not reach its payment. Nothing has been charged. Please contact support with this page open."
      />
    );
  }

  const noAttemptYet = attemptQuery.isError && isNoAttemptStarted(attemptQuery.error);

  if (attemptQuery.isPending && !noAttemptYet && startPayment.data == null) {
    return <PaymentSkeleton />;
  }

  if (attemptQuery.isError && !noAttemptYet) {
    return (
      <ErrorState
        severity="warning"
        title="We could not check your payment"
        message={describeError(attemptQuery.error, "read").message}
        actionLabel="Try again"
        onAction={refreshAttempt}
      />
    );
  }

  /* No attempt exists yet — the ordinary first visit. */
  if (attempt === null) {
    return (
      <div>
        <h2 className="text-lg font-bold text-text">Pay for your booking</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Every visit has a professional committed to it. Paying now confirms the booking;
          until then the professionals are held, not booked.
        </p>

        {startPayment.isError ? (
          <p className="mt-4 text-sm text-critical" role="alert">
            {describeError(startPayment.error, "mutation").message}
          </p>
        ) : null}

        <div className="mt-5">
          <Button
            loading={startPayment.isPending}
            loadingLabel="Opening payment"
            onClick={() =>
              startPayment.mutate({
                checkoutId,
                expectedCheckoutVersion: group.checkout_version!,
                groupId: group.id,
              })
            }
          >
            Continue to payment
          </Button>
        </div>
      </div>
    );
  }

  const phase = paymentPhase(attempt, serverNow());

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">
            {phase === "paid" ? "Your booking is paid for" : "Pay for your booking"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
          </p>
        </div>
        {countdown !== null && phase !== "paid" ? (
          <Badge tone={countdown.isExpired ? "danger" : "neutral"}>
            {countdown.isExpired ? (
              "Payment window closed"
            ) : (
              <>
                {/* Digits for sight, a coarse phrase for assistive technology.
                    A per-second string in a live region is unusable aloud. */}
                <span aria-hidden data-numeric>
                  Held for {countdown.display}
                </span>
                <span className="sr-only">{countdown.announce}</span>
              </>
            )}
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 rounded-card border border-line-strong bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold text-text">Amount</span>
          <Money value={attempt.amount} className="text-xl font-bold tabular-nums text-text" />
        </div>
        <AllocationList attempt={attempt} />
      </div>

      {phase === "paid" ? (
        <div className="mt-4">
          <p className="text-sm text-text-secondary">
            Your payment is confirmed and your booking is going ahead.
          </p>
          {group.order_id !== null ? (
            <p className="mt-3">
              <Link
                href={`/bookings/${group.id}/receipt`}
                className="text-sm font-semibold text-text-link hover:underline"
              >
                View your receipt
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "ambiguous" ? (
        <div className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
          <h3 className="text-sm font-semibold text-text">We are confirming this payment</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Your bank has responded but we have not yet been able to confirm the payment with
            our provider. Do not pay again — if money left your account it is accounted for,
            and we will complete or return it.
          </p>
          {reconcile.isError ? (
            <p className="mt-3 text-sm text-critical" role="alert">
              {isProviderUnreachable(reconcile.error)
                ? "We could not reach the payment provider just now. Nothing has changed. Please try again shortly."
                : describeError(reconcile.error, "mutation").message}
            </p>
          ) : null}
          {canReconcile(attempt) ? (
            <div className="mt-4">
              <Button
                variant="outline"
                loading={reconcile.isPending}
                loadingLabel="Checking"
                onClick={() => reconcile.mutate(attempt.id)}
              >
                Check again
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "not-charged" ? (
        <div className="mt-4">
          <p className="text-sm text-text-secondary">
            That payment did not go through and you have not been charged. Your professionals
            are held until the time above.
          </p>
        </div>
      ) : null}

      {phase === "expired" ? (
        <ErrorState
          severity="warning"
          title="This payment window has closed"
          message="You have not been charged. The professionals who were held for this booking have been released, so it needs to be planned again."
          actionLabel="Start again"
          onAction={() => undefined}
        />
      ) : null}

      {phase === "preparing" ? (
        <p className="mt-4 text-sm text-text-secondary">
          We are setting up your payment. This takes a moment.
        </p>
      ) : null}

      {phase === "awaiting-provider" ? (
        <p className="mt-4 text-sm text-text-secondary">
          This payment cannot be completed in the browser on this environment. Please contact
          support with this page open.
        </p>
      ) : null}

      {handoffError !== null ? (
        <p className="mt-4 text-sm text-critical" role="alert">
          {handoffError}
        </p>
      ) : null}

      {phase === "awaiting-customer" || phase === "not-charged" ? (
        <div className="mt-5">
          <Button
            loading={isHandingOff}
            loadingLabel="Opening payment"
            onClick={() => void handlePay(attempt)}
          >
            {phase === "not-charged" ? "Try payment again" : "Continue to payment"}
          </Button>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-text-secondary">
        Reference <span className="font-mono tabular-nums">{group.id}</span>
      </p>
    </div>
  );
}
