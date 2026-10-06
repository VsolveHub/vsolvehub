// Ported from frontend/apps/customer/features/payment/view/payment-workspace.tsx
import type { Schemas } from "@vsolve/api-client";
import { RazorpayCheckout } from "@vsolve/mobile-core";
import { describeError, useServerCountdown } from "@vsolve/query/native";
import { Badge, Button, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, ScrollView, View } from "react-native";

import { useProfileCompletionGate } from "@/features/account/view/profile-completion-dialog";
import { useBookingGroup, type BookingGroup } from "@/features/bookings/queries";
import { Money } from "@/features/payment/view/money";
import { canReconcile, paymentPhase, type PaymentAttempt } from "@/features/payment/model/outcome";
import { handoffTarget } from "@/features/payment/model/provider-handoff";
import {
  isNoAttemptStarted,
  isProviderUnreachable,
  isSimulatedCaptureUnavailable,
  serverNow,
  useCheckoutPayment,
  usePaymentAttempt,
  useReconcilePayment,
  useSimulateCapture,
  useStartPayment,
  type PaymentAllocation,
} from "@/features/payment/queries";

const ALLOCATION_KIND_LABEL: Record<Schemas["QuoteLineKindEnum"], string> = {
  SERVICE: "Service",
  MINIMUM_VISIT_ADJUSTMENT: "Tax",
  PLATFORM_FEE_ALLOCATION: "Platform fee",
};

function allocationLabel(allocation: PaymentAllocation, group: BookingGroup): string {
  const unit = group.units.find((candidate) => candidate.id === allocation.fulfilment_unit_id);
  const line = unit?.lines.find((candidate) => candidate.id === allocation.fulfilment_line_id);
  const kindName = line === undefined ? null : ALLOCATION_KIND_LABEL[line.kind];
  const name = kindName ?? line?.label ?? `Item ${allocation.position + 1}`;
  if (group.units.length > 1 && unit !== undefined) {
    return `Visit ${unit.position + 1} · ${name}`;
  }
  return name;
}

function AllocationList({ attempt, group }: { attempt: PaymentAttempt; group: BookingGroup }) {
  if (attempt.allocations.length === 0) return null;
  return (
    <View className="mt-4 gap-1">
      {attempt.allocations.map((allocation) => (
        <View key={allocation.id} className="flex-row justify-between gap-3">
          <Text className="text-sm text-text-secondary">{allocationLabel(allocation, group)}</Text>
          <Money value={allocation.amount} className="shrink-0 text-sm tabular-nums text-text-secondary" />
        </View>
      ))}
    </View>
  );
}

function bookingPageHref(groupId: string): string {
  return `/bookings/${groupId}`;
}

function shouldReturnToBooking(group: BookingGroup | null, attempt: PaymentAttempt | null): boolean {
  if (attempt !== null && paymentPhase(attempt, serverNow()) === "paid") return true;
  return group !== null && group.order_id !== null && group.recovery_action !== "PAYMENT_REQUIRED";
}

function PaymentSkeleton() {
  return (
    <View className="gap-3 px-4 py-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-11 w-40" />
    </View>
  );
}

export function PayScreen({ groupId }: { groupId: string }) {
  const router = useRouter();
  const groupQuery = useBookingGroup(groupId);
  const group = groupQuery.data ?? null;
  const checkoutId = group?.checkout_id ?? null;
  const checkoutPayment = useCheckoutPayment(checkoutId);
  const startPayment = useStartPayment();
  const [startedId, setStartedId] = useState<string | null>(null);
  const attemptId = startedId ?? checkoutPayment.data?.id ?? startPayment.data?.id ?? null;
  const attemptQuery = usePaymentAttempt(attemptId);
  const reconcile = useReconcilePayment();
  const simulateCapture = useSimulateCapture();
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const profileGate = useProfileCompletionGate("payment");

  const attempt = attemptQuery.data ?? checkoutPayment.data ?? startPayment.data ?? null;
  const countdown = useServerCountdown(attempt?.expires_at ?? null);
  const returnToBooking = shouldReturnToBooking(group, attempt);
  const handoff = attempt ? handoffTarget(attempt) : null;

  useEffect(() => {
    if (!returnToBooking) return;
    router.replace(bookingPageHref(groupId) as never);
  }, [returnToBooking, groupId, router]);

  const refreshAttempt = useCallback(() => {
    void attemptQuery.refetch();
    void checkoutPayment.refetch();
    void groupQuery.refetch();
  }, [attemptQuery, checkoutPayment, groupQuery]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshAttempt();
    });
    return () => subscription.remove();
  }, [refreshAttempt]);

  async function handlePay(current: PaymentAttempt) {
    if (current.simulated_capture_available && !isSimulatedCaptureUnavailable(simulateCapture.error)) {
      setHandoffError(null);
      try {
        await simulateCapture.mutateAsync(current.id);
      } catch {
        // The mutation owns the visible error while the screen stays retryable.
      }
      return;
    }
    const target = handoffTarget(current);
    if (target === null) {
      setHandoffError(
        "This payment cannot be opened in your browser. Please contact support with this page open.",
      );
      return;
    }
    setHandoffError(null);
    setIsHandingOff(true);
  }

  async function handleStartPayment() {
    if (group === null || checkoutId === null || group.checkout_version === null) return;
    setHandoffError(null);
    try {
      const created = await startPayment.mutateAsync({
        checkoutId,
        expectedCheckoutVersion: group.checkout_version,
        groupId: group.id,
      });
      setStartedId(created.id);
      if (created.simulated_capture_available && !isSimulatedCaptureUnavailable(simulateCapture.error)) {
        await simulateCapture.mutateAsync(created.id);
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
          groupQuery.isError ? describeError(groupQuery.error, "read").message : "This booking could not be found."
        }
        actionLabel="Back to my bookings"
        onAction={() => router.replace("/bookings" as never)}
      />
    );
  }

  if (returnToBooking) return <PaymentSkeleton />;

  if (group.recovery_action !== "PAYMENT_REQUIRED" && group.order_id === null) {
    return (
      <ErrorState
        severity="info"
        title="This booking is not waiting for payment"
        message="Nothing is due right now. Your booking page has the current status."
        actionLabel="Back to this booking"
        onAction={() => router.replace(bookingPageHref(groupId) as never)}
      />
    );
  }

  if (checkoutId === null) {
    return (
      <ErrorState
        severity="warning"
        title="We cannot open payment for this booking"
        message="The booking exists but we could not reach its payment. Nothing has been charged. Please contact support with this page open."
      />
    );
  }

  const noAttemptYet = checkoutPayment.isError && isNoAttemptStarted(checkoutPayment.error);

  if (checkoutPayment.isPending && !noAttemptYet && startPayment.data == null && attempt == null) {
    return <PaymentSkeleton />;
  }

  if (checkoutPayment.isError && !noAttemptYet && attempt == null) {
    return (
      <ErrorState
        severity="warning"
        title="We could not check your payment"
        message={describeError(checkoutPayment.error, "read").message}
        actionLabel="Try again"
        onAction={refreshAttempt}
      />
    );
  }

  if (attempt === null) {
    return (
      <ScrollView className="flex-1" contentContainerClassName="px-4 py-6">
        <Text className="text-lg font-bold text-text">Pay for your booking</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Every visit has a professional committed to it. Paying now confirms the booking; until then the professionals are held, not booked.
        </Text>
        {startPayment.isError ? (
          <Text className="mt-4 text-sm text-critical" accessibilityRole="alert">
            {describeError(startPayment.error, "mutation").message}
          </Text>
        ) : null}
        {simulateCapture.isError && !isSimulatedCaptureUnavailable(simulateCapture.error) ? (
          <Text className="mt-4 text-sm text-critical" accessibilityRole="alert">
            {describeError(simulateCapture.error, "mutation").message}
          </Text>
        ) : null}
        <View className="mt-5">
          <Button
            loading={startPayment.isPending || simulateCapture.isPending}
            loadingLabel={simulateCapture.isPending ? "Marking as paid" : "Opening payment"}
            onPress={() => profileGate.run(() => void handleStartPayment())}
          >
            Continue to payment
          </Button>
        </View>
        {profileGate.dialog}
      </ScrollView>
    );
  }

  const phase = paymentPhase(attempt, serverNow());

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-4 py-6">
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <View>
          <Text className="text-lg font-bold text-text">
            {phase === "paid" ? "Your booking is paid for" : "Pay for your booking"}
          </Text>
          <Text className="mt-1 text-sm text-text-secondary">
            {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
          </Text>
        </View>
        {countdown !== null && phase !== "paid" ? (
          <Badge tone={countdown.isExpired ? "danger" : "neutral"}>
            {countdown.isExpired ? "Payment window closed" : `Held for ${countdown.display}`}
          </Badge>
        ) : null}
      </View>

      <View className="mt-4 rounded-card border border-line-strong bg-surface p-4">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-base font-semibold text-text">Amount</Text>
          <Money value={attempt.amount} className="text-xl font-bold tabular-nums text-text" />
        </View>
        <AllocationList attempt={attempt} group={group} />
      </View>

      {phase === "paid" ? (
        <View className="mt-4">
          <Text className="text-sm text-text-secondary">Your payment is confirmed and your booking is going ahead.</Text>
        </View>
      ) : null}

      {phase === "ambiguous" ? (
        <View className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
          <Text className="text-sm font-semibold text-text">We are confirming this payment</Text>
          <Text className="mt-1 text-sm text-text-secondary">
            Your bank has responded but we have not yet been able to confirm the payment with our provider. Do not pay again — if money left your account it is accounted for, and we will complete or return it.
          </Text>
          {reconcile.isError ? (
            <Text className="mt-3 text-sm text-critical" accessibilityRole="alert">
              {isProviderUnreachable(reconcile.error)
                ? "We could not reach the payment provider just now. Nothing has changed. Please try again shortly."
                : describeError(reconcile.error, "mutation").message}
            </Text>
          ) : null}
          {canReconcile(attempt) ? (
            <View className="mt-4">
              <Button
                variant="outline"
                loading={reconcile.isPending}
                loadingLabel="Checking"
                onPress={() => reconcile.mutate(attempt.id)}
              >
                Check again
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}

      {phase === "not-charged" ? (
        <Text className="mt-4 text-sm text-text-secondary">
          That payment did not go through and you have not been charged. Your professionals are held until the time above.
        </Text>
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
        <Text className="mt-4 text-sm text-text-secondary">We are setting up your payment. This takes a moment.</Text>
      ) : null}

      {phase === "awaiting-provider" && !attempt.simulated_capture_available ? (
        <Text className="mt-4 text-sm text-text-secondary">
          This payment cannot be completed in the browser on this environment.
        </Text>
      ) : null}

      {handoffError !== null ? (
        <Text className="mt-4 text-sm text-critical" accessibilityRole="alert">
          {handoffError}
        </Text>
      ) : null}

      {simulateCapture.isError && !isSimulatedCaptureUnavailable(simulateCapture.error) ? (
        <Text className="mt-4 text-sm text-critical" accessibilityRole="alert">
          {describeError(simulateCapture.error, "mutation").message}
        </Text>
      ) : null}

      {(attempt.simulated_capture_available && phase === "preparing") ||
      phase === "awaiting-customer" ||
      phase === "awaiting-provider" ||
      phase === "not-charged" ? (
        <View className="mt-5">
          <Button
            loading={isHandingOff || simulateCapture.isPending}
            loadingLabel={attempt.simulated_capture_available ? "Marking as paid" : "Opening payment"}
            onPress={() => profileGate.run(() => void handlePay(attempt))}
          >
            {attempt.simulated_capture_available
              ? "Mark as paid"
              : phase === "not-charged"
                ? "Try payment again"
                : "Continue to payment"}
          </Button>
        </View>
      ) : null}

      <Text className="mt-4 text-sm text-text-secondary">
        Reference <Text className="font-mono text-sm tabular-nums text-text-secondary">{group.id}</Text>
      </Text>

      {isHandingOff && handoff ? (
        <RazorpayCheckout
          publicKey={handoff.publicKey}
          providerOrderId={handoff.providerOrderId}
          amountPaise={handoff.amountPaise}
          currency={handoff.currency}
          onEnded={() => {
            setIsHandingOff(false);
            refreshAttempt();
          }}
        />
      ) : null}
      {profileGate.dialog}
    </ScrollView>
  );
}
