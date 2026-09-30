"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError, useServerCountdown } from "@vsolve/query";
import { Badge, Button, ErrorState, Skeleton } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useProfileCompletionGate } from "@/features/account/view/profile-completion-dialog";
import { useBookingGroup, type BookingGroup } from "@/features/bookings/queries";
import { Money } from "@/features/checkout/view/money";

import { paymentPhase, canReconcile, type PaymentAttempt } from "../model/outcome";
import { handoffTarget, openProviderCheckout } from "../model/provider-handoff";
import { waitForPaymentHandoff } from "../standalone-handoff";
import {
  isNoAttemptStarted,
  isProviderUnreachable,
  isSimulatedCaptureUnavailable,
  serverNow,
  useCheckoutPayment,
  useReconcilePayment,
  useSimulateCapture,
  useStartPayment,
  type PaymentAllocation,
} from "../queries";
import { CheckoutLoyaltyOptions, useCheckoutLoyalty } from "./checkout-loyalty-options";

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

/**
 * Customer-facing names for a payment allocation.
 *
 * Allocations are Fulfilment Unit *lines* (service, tax/minimum-visit
 * adjustment, platform fee), not visits. Labelling them "Visit {position + 1}"
 * made a three-line bill read as Visit 2, Visit 3, Visit 4.
 */
const ALLOCATION_KIND_LABEL: Record<Schemas["QuoteLineKindEnum"], string> = {
  SERVICE: "Service",
  MINIMUM_VISIT_ADJUSTMENT: "Tax",
  PLATFORM_FEE_ALLOCATION: "Platform fee",
};

function allocationLabel(
  allocation: PaymentAllocation,
  group: BookingGroup,
): string {
  const unit = group.units.find((candidate) => candidate.id === allocation.fulfilment_unit_id);
  const line = unit?.lines.find((candidate) => candidate.id === allocation.fulfilment_line_id);
  const kindName = line === undefined ? null : ALLOCATION_KIND_LABEL[line.kind];
  const name = kindName ?? line?.label ?? `Item ${allocation.position + 1}`;
  if (group.units.length > 1 && unit !== undefined) {
    return `Visit ${unit.position + 1} · ${name}`;
  }
  return name;
}

/** Per-unit allocations, named from the booking's own lines. */
function AllocationList({
  attempt,
  group,
}: {
  attempt: PaymentAttempt;
  group: BookingGroup;
}) {
  if (attempt.allocations.length === 0) return null;

  return (
    <ul className="mt-4 flex flex-col gap-1 text-sm">
      {attempt.allocations.map((allocation) => (
        <li key={allocation.id} className="flex justify-between gap-3">
          <span className="text-text-secondary">{allocationLabel(allocation, group)}</span>
          <span className="shrink-0 tabular-nums text-text-secondary">
            <Money value={allocation.amount} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function bookingPageHref(groupId: string): string {
  return `/bookings/${groupId}`;
}

/**
 * Payment is done — leave `/pay` for the booking itself.
 *
 * Capture used to render "Your booking is paid for" on this route. That is a
 * second page for a booking the customer already has. The booking screen is
 * the source of truth once money has moved.
 */
function shouldReturnToBooking(
  group: BookingGroup | null,
  attempt: PaymentAttempt | null,
): boolean {
  if (attempt !== null && paymentPhase(attempt, serverNow()) === "paid") {
    return true;
  }
  return (
    group !== null &&
    group.order_id !== null &&
    group.recovery_action !== "PAYMENT_REQUIRED"
  );
}

export function PaymentWorkspace({ groupId }: { groupId: string }) {
  const router = useRouter();
  const profileGate = useProfileCompletionGate("payment");
  const groupQuery = useBookingGroup(groupId);
  const group = groupQuery.data ?? null;
  const checkoutId = group?.checkout_id ?? null;

  const attemptQuery = useCheckoutPayment(checkoutId);
  const startPayment = useStartPayment();
  const reconcile = useReconcilePayment();
  const simulateCapture = useSimulateCapture();

  /**
   * The widget is open. Tracked so the page cannot offer a second handoff over
   * the top of the first — two provider sessions against one order is how a
   * customer ends up staring at two dialogs and trusting whichever closes last.
   */
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  // `useStartPayment` writes the created attempt straight into the checkout key,
  // so the poll picks it up without a second round trip.
  const payablePaise =
    group?.units.reduce((sum, unit) => sum + unit.total.amount_paise, 0) ?? 0;
  const loyalty = useCheckoutLoyalty(payablePaise);
  const attempt = attemptQuery.data ?? startPayment.data ?? null;
  const countdown = useServerCountdown(attempt?.expires_at ?? null);
  const returnToBooking = shouldReturnToBooking(group, attempt);

  useEffect(() => {
    if (!returnToBooking) return;
    router.replace(bookingPageHref(groupId));
  }, [returnToBooking, groupId, router]);

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
    if (
      current.simulated_capture_available &&
      !isSimulatedCaptureUnavailable(simulateCapture.error)
    ) {
      setHandoffError(null);
      try {
        await simulateCapture.mutateAsync(current.id);
      } catch {
        // The mutation owns the visible error while the screen stays retryable.
      }
      return;
    }

    setHandoffError(null);
    setIsHandingOff(true);
    try {
      const readyAttempt = await waitForPaymentHandoff(current.id);
      if (
        readyAttempt.simulated_capture_available &&
        !isSimulatedCaptureUnavailable(simulateCapture.error)
      ) {
        await simulateCapture.mutateAsync(readyAttempt.id);
        return;
      }
      const target = handoffTarget(readyAttempt);
      if (target === null) {
        setHandoffError(
          "This payment is still preparing or cannot be opened. Please try again in a moment.",
        );
        return;
      }
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

  async function handleStartPayment() {
    if (group === null || checkoutId === null || group.checkout_version === null) return;

    setHandoffError(null);
    try {
      const created = await startPayment.mutateAsync({
        checkoutId,
        expectedCheckoutVersion: group.checkout_version,
        groupId: group.id,
        walletAmountPaise: loyalty.walletAmountPaise,
        coinBurnAmount: loyalty.coinBurnAmount,
      });
      if (
        created.simulated_capture_available &&
        !isSimulatedCaptureUnavailable(simulateCapture.error)
      ) {
        await simulateCapture.mutateAsync(created.id);
      } else {
        await handlePay(created);
      }
    } catch {
      // The relevant mutation owns the visible error while the screen stays retryable.
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
        onAction={() => router.replace("/bookings")}
      />
    );
  }

  if (returnToBooking) {
    return <PaymentSkeleton />;
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
        onAction={() => router.replace(bookingPageHref(groupId))}
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
        {simulateCapture.isError && !isSimulatedCaptureUnavailable(simulateCapture.error) ? (
          <p className="mt-4 text-sm text-critical" role="alert">
            {describeError(simulateCapture.error, "mutation").message}
          </p>
        ) : null}

        <CheckoutLoyaltyOptions loyalty={loyalty} />

        <div className="mt-5">
          <Button
            loading={startPayment.isPending || simulateCapture.isPending}
            loadingLabel={simulateCapture.isPending ? "Marking as paid" : "Opening payment"}
            onClick={() => profileGate.run(() => void handleStartPayment())}
          >
            Continue to payment
          </Button>
        </div>
        {profileGate.dialog}
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
        <AllocationList attempt={attempt} group={group} />
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

      {phase === "awaiting-provider" && !attempt.simulated_capture_available ? (
        <p className="mt-4 text-sm text-text-secondary">
          This payment cannot be completed in the browser on this environment.
        </p>
      ) : null}

      {handoffError !== null ? (
        <p className="mt-4 text-sm text-critical" role="alert">
          {handoffError}
        </p>
      ) : null}

      {simulateCapture.isError && !isSimulatedCaptureUnavailable(simulateCapture.error) ? (
        <p className="mt-4 text-sm text-critical" role="alert">
          {describeError(simulateCapture.error, "mutation").message}
        </p>
      ) : null}

      {(attempt.simulated_capture_available && phase === "preparing") ||
      phase === "awaiting-customer" ||
      phase === "awaiting-provider" ||
      phase === "not-charged" ? (
        <div className="mt-5">
          <Button
            loading={isHandingOff || simulateCapture.isPending}
            loadingLabel={
              attempt.simulated_capture_available ? "Marking as paid" : "Opening payment"
            }
            onClick={() => profileGate.run(() => void handlePay(attempt))}
          >
            {attempt.simulated_capture_available
              ? "Mark as paid"
              : phase === "not-charged"
                ? "Try payment again"
                : "Continue to payment"}
          </Button>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-text-secondary">
        Reference <span className="font-mono tabular-nums">{group.id}</span>
      </p>
      {profileGate.dialog}
    </div>
  );
}
