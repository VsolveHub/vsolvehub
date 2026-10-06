// Ported from frontend/apps/customer/features/crew/view/book-crew-fee-screen.tsx
import {
  bookingFeePhase,
  bookingPhase,
  canCheckOutBookingFee,
  isBookingFeeNotChargeable,
  useServerCountdown,
  type BookingFeePhase,
} from "@vsolve/query/native";
import { Badge, Button, ErrorState, Skeleton, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { requestHref } from "@/lib/routes";

import { confirmedCrewName, toBookingView, toRateTermsView } from "../adapters";
import { useRateCardState, useStartBookingFeeCheckout } from "../queries";
import { AccessRefusal } from "./access-refusal";
import { RateTermsLink } from "./rate-terms-sheet";

export interface BookCrewFeeScreenProps {
  requirementId: string;
  requestHref?: string;
}

export function BookCrewFeeScreen({ requirementId, requestHref: requestHrefProp }: BookCrewFeeScreenProps) {
  const router = useRouter();
  const backHref = requestHrefProp ?? requestHref(requirementId);
  const rateQuery = useRateCardState(requirementId);
  const checkout = useStartBookingFeeCheckout();

  const state = rateQuery.data ?? null;
  const booking = state?.booking ?? null;
  const holdCountdown = useServerCountdown(booking?.hold_expires_at ?? null);
  const holdAnnouncement = holdCountdown?.announce ?? undefined;
  const holdRemaining = holdCountdown === null || holdCountdown.isExpired ? null : holdCountdown.display;

  if (rateQuery.isPending) {
    return (
      <Wrapper>
        <View accessibilityState={{ busy: true }} accessibilityLiveRegion="polite">
          <Text className="sr-only">Loading your booking</Text>
          <Skeleton className="h-40 w-full" />
        </View>
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
        <View className="mt-8">
          <Link href={backHref as never} asChild>
            <Pressable accessibilityRole="button" className={buttonStyles({ variant: "ghost" })}>
              <Text className="text-sm font-semibold text-text-link">Back to this request</Text>
            </Pressable>
          </Link>
        </View>
      </Wrapper>
    );
  }

  const view = toBookingView(booking);
  const terms = toRateTermsView(view);
  const feePhase = bookingFeePhase(state);
  const crewName = confirmedCrewName(state);
  const isHeld = bookingPhase(state) === "offer_held";

  const refusal = isBookingFeeNotChargeable(checkout.error) ? (
    <ErrorState
      title="Nobody is holding this job any more"
      message="The hold ran out while you were here, so there is nothing to pay for right now. Nothing has been charged. We are still looking for a crew at the same published rate."
      severity="warning"
      inline
    />
  ) : (
    <AccessRefusal error={checkout.error} attempting="pay the booking fee" />
  );

  return (
    <View className="mx-auto w-full max-w-md gap-4 px-4 py-6">
      <Pressable accessibilityRole="button" onPress={() => router.push(backHref as never)} className="self-start">
        <Text className="text-sm font-semibold text-text-link">← Back</Text>
      </Pressable>
      <View className="gap-4">
        <View className="rounded-card border border-success-line bg-success-surface p-4">
          <View className="flex-row flex-wrap items-start justify-between gap-2">
            <Text className="font-semibold text-text">{crewName ?? "A supervisor accepted"}</Text>
            {isHeld && holdRemaining !== null ? (
              <Badge tone="success">
                Holding <Text accessibilityLabel={holdAnnouncement}>{holdRemaining}</Text>
              </Badge>
            ) : (
              <Badge tone="success">Holding it for you</Badge>
            )}
          </View>
          <Text className="mt-3 text-sm font-semibold text-text">Booking fee {view.bookingFeeLabel}</Text>
          <Text className="mt-0.5 text-sm leading-6 text-text-secondary">Now, on UPI, to Vsolve. Refunded if nobody turns up.</Text>
          <Text className="mt-2 text-sm leading-6 text-text-secondary">
            Then {view.leadDayReceiptLabel} a day to the crew, paid by you each evening.
          </Text>
        </View>

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
          requestHref={backHref}
        />
        {refusal}
        <RateTermsLink terms={terms} />
      </View>
    </View>
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  return <View className="mx-auto w-full max-w-md px-4 py-6">{children}</View>;
}

function CheckoutAction({
  phase,
  canCheckOut,
  feeLabel,
  isPending,
  onPay,
  requestHref: href,
}: {
  phase: BookingFeePhase;
  canCheckOut: boolean;
  feeLabel: string;
  isPending: boolean;
  onPay: () => void;
  requestHref: string;
}) {
  if (phase === "pending") {
    return (
      <Text accessibilityRole="text" className="text-sm leading-6 text-text">
        Confirming your payment… don’t pay again.
      </Text>
    );
  }
  if (phase === "active" || phase === "earned") {
    return (
      <View>
        <Text className="text-sm font-medium text-text">Your crew is confirmed</Text>
        <View className="mt-3">
          <Link href={href as never} asChild>
            <Pressable accessibilityRole="button" className={buttonStyles({ variant: "primary" })}>
              <Text className="text-sm font-semibold text-action-text">Open this booking</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }
  if (phase === "forfeited" || phase === "refunded") {
    return (
      <Text className="text-sm leading-6 text-text-secondary">
        This booking is already settled — the request itself says what happened to the fee.
      </Text>
    );
  }
  if (!canCheckOut) {
    return (
      <Text className="text-sm leading-6 text-text-secondary">
        No one is holding this job right now, so there is nothing to pay for. ₹0 charged.
      </Text>
    );
  }
  const hasFailed = phase === "failed";
  return (
    <View>
      <Button block onPress={onPay} loading={isPending} loadingLabel="Starting your payment">
        {hasFailed ? `Try again — Pay ${feeLabel} & confirm` : `Pay ${feeLabel} & confirm`}
      </Button>
      <Text className="mt-2 text-center text-xs leading-5 text-text-secondary">Not now — hold lapses, ₹0 charged</Text>
    </View>
  );
}
