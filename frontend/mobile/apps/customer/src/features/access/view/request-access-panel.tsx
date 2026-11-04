// Ported from frontend/apps/customer/features/access/view/{request-access-panel,unlock-panel,visit-plan-checkout}.tsx
// and the payment and phase parts of visit-tracker.tsx. Compact for the phone: the web's full
// visit tracker is a page of its own here (`visits/[visitId]`), linked from each row.
import { useCompleteOrOpenCheckout } from "@vsolve/mobile-core";
import { Badge, Button, EmptyState, Skeleton, Text, buttonStyles } from "@vsolve/mobile-ui";
import {
  bookingPhase,
  canCheckOutVisitPlan,
  unlockPhase,
  visitPlanPhase,
  type RateCardBookingPhase,
  type UnlockPhase,
  type VisitPlanPhase,
} from "@vsolve/query/native";
import { Link } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, Pressable, View } from "react-native";

import { useProfileCompletionGate } from "@/features/account/view/profile-completion-dialog";
import { useRateCardState } from "@/features/crew/queries";
import type { RequirementArchetype } from "@/features/requirement/adapters";
import { bookCrewFeeHref, requestQuotesHref, visitHref } from "@/lib/routes";

import {
  formatVisitSlot,
  toPlanCheckoutView,
  toTeaserListView,
  toVisitTrackerView,
  unlockPriceLabel,
  type TeaserView,
  type VisitTrackerView,
} from "../adapters";
import {
  useQuoteTeasers,
  useStartUnlockCheckout,
  useStartVisitPlanCheckout,
  useUnlockState,
  useVisitPlan,
} from "../queries";
import { AccessRefusal } from "./access-refusal";

export interface RequestAccessPanelProps {
  requirementId: string;
  archetype: RequirementArchetype | null;
  supportAction?: ReactNode;
}

/**
 * The money surface on one request: the A3 door or the A5 one, never both. Which one is decided
 * by the server's inferred archetype, because the two doors have different endpoints and
 * different refusals. An unrecognised archetype renders nothing rather than the closest-looking
 * money control.
 */
export function RequestAccessPanel(props: RequestAccessPanelProps) {
  if (props.archetype === "A3_TIME_BLOCK") return <A3Access {...props} />;
  if (props.archetype === "A5_CUSTOM_PROJECT") return <A5Access {...props} />;
  return null;
}

function Card({ children }: { children: ReactNode }) {
  return <View className="gap-3 rounded-card border border-line bg-surface p-4">{children}</View>;
}

function Body({ children }: { children: ReactNode }) {
  return <Text className="text-sm leading-6 text-text-secondary">{children}</Text>;
}

/* ------------------------------------------------------------------------------------------
   A3: the rate-card crew booking, or the quote unlock (the thin-supply fallback)
   ------------------------------------------------------------------------------------------ */

const CREW_STATUS: Partial<Record<RateCardBookingPhase, string>> = {
  matching: "We are offering your job to crews at the published rate.",
  offer_held: "A crew is holding your job. Pay the booking fee to confirm them.",
  confirmed: "Your crew is confirmed.",
  cancelled: "This crew booking was cancelled.",
};

function A3Access({ requirementId, supportAction }: RequestAccessPanelProps) {
  const rateQuery = useRateCardState(requirementId);
  const rateState = rateQuery.data ?? null;
  const crewPhase = rateState === null ? null : bookingPhase(rateState);
  // Until the rate-card read answers, the request is on neither door. Showing the quote
  // surface and then swapping it for a crew booking would flash a paywall at somebody who has
  // a crew booked.
  const onInstantPath = crewPhase !== null && crewPhase !== "unbooked";
  const showQuoteFallback = !onInstantPath || crewPhase === "fell_back";

  return (
    <View className="gap-4">
      {onInstantPath ? (
        <Card>
          <Text className="text-lg font-semibold text-text">Your crew booking</Text>
          <Body>{(crewPhase && CREW_STATUS[crewPhase]) ?? "Open the booking to see where it stands."}</Body>
          <Link href={bookCrewFeeHref(requirementId) as never} asChild>
            <Pressable accessibilityRole="button" className={buttonStyles({ block: true })}>
              <Text className="text-sm font-semibold text-white">Open the crew booking</Text>
            </Pressable>
          </Link>
        </Card>
      ) : null}
      {showQuoteFallback ? (
        <A3QuoteAccess
          requirementId={requirementId}
          isResolvingDoor={rateQuery.isPending}
          supportAction={supportAction}
        />
      ) : null}
    </View>
  );
}

function A3QuoteAccess({
  requirementId,
  isResolvingDoor,
  supportAction,
}: {
  requirementId: string;
  isResolvingDoor: boolean;
  supportAction?: ReactNode;
}) {
  const profileGate = useProfileCompletionGate("payment");
  const teasersQuery = useQuoteTeasers(requirementId);
  const unlockQuery = useUnlockState(requirementId);
  const checkout = useStartUnlockCheckout();
  const completeOrOpenCheckout = useCompleteOrOpenCheckout();
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<unknown>(null);

  const unlock = unlockQuery.data ?? null;
  const teasers = teasersQuery.data === undefined ? null : toTeaserListView(teasersQuery.data);
  const phase = unlock === null ? null : unlockPhase(unlock);
  const priceLabel = unlockPriceLabel(unlock?.price_paise ?? null);

  async function startUnlockPayment() {
    setHandoffError(null);
    try {
      const started = await checkout.mutateAsync({
        requirementId,
        isRetryAfterFailure: phase === "failed",
      });
      setIsHandingOff(true);
      await completeOrOpenCheckout(String(started.payment_attempt_id));
      void unlockQuery.refetch();
    } catch (error) {
      setHandoffError(error);
    } finally {
      setIsHandingOff(false);
    }
  }

  if (isResolvingDoor || unlockQuery.isPending || teasersQuery.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  // The unlock read decides what may be offered, so its failure stops the panel. A failed
  // teaser read would read as "no quotes yet", which is why it is surfaced too.
  const readError = unlockQuery.error ?? teasersQuery.error;
  if (readError) {
    return (
      <AccessRefusal
        error={readError}
        attempting="see the quotes on this request"
        supportAction={supportAction}
        onRetry={() => {
          void unlockQuery.refetch();
          void teasersQuery.refetch();
        }}
        inline={false}
      />
    );
  }

  const usableQuoteCount = unlock?.usable_quote_count ?? teasers?.usableQuoteCount ?? 0;
  const rows = teasers?.teasers ?? [];

  return (
    <Card>
      <Text className="text-lg font-semibold text-text">Quotes for this request</Text>
      {rows.length === 0 ? (
        <EmptyState
          compact
          title="No quotes yet"
          description="Professionals are still looking at this. Nothing is charged until at least one of them has quoted."
        />
      ) : (
        <>
          <Body>
            {usableQuoteCount === 1
              ? "One professional has quoted. Here is what we can show you before you unlock it."
              : `${usableQuoteCount} professionals have quoted. Here is what we can show you before you unlock them.`}
          </Body>
          <View className="gap-2">
            {rows.map((teaser) => (
              <TeaserRow key={teaser.proposalId} teaser={teaser} />
            ))}
          </View>
        </>
      )}
      <View className="gap-3 border-t border-line pt-3">
        <UnlockAction
          phase={phase ?? "not_yet"}
          priceLabel={priceLabel}
          requirementId={requirementId}
          isStarting={checkout.isPending || isHandingOff}
          onStart={() => profileGate.run(() => void startUnlockPayment())}
        />
        <AccessRefusal
          error={checkout.error ?? handoffError}
          attempting="unlock these quotes"
          supportAction={supportAction}
        />
      </View>
      {profileGate.dialog}
    </Card>
  );
}

/** Only what the server publishes to somebody who has paid nothing: a band, a type, a flag. */
function TeaserRow({ teaser }: { teaser: TeaserView }) {
  return (
    <View className="flex-row items-start justify-between gap-3 rounded-card border border-line p-3">
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-text">{teaser.bandLabel}</Text>
        <Text className="mt-0.5 text-sm text-text-secondary">{teaser.vendorType}</Text>
        {teaser.isOutOfBudget ? (
          <Text className="mt-1 text-sm text-text-secondary">
            Above the budget you gave us. It is still a real quote — we are not hiding it.
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-1">
        {teaser.isVerified ? <Badge tone="success">Verified</Badge> : null}
        {teaser.isOutOfBudget ? <Badge tone="warning">Over budget</Badge> : null}
      </View>
    </View>
  );
}

function UnlockAction({
  phase,
  priceLabel,
  requirementId,
  isStarting,
  onStart,
}: {
  phase: UnlockPhase;
  priceLabel: string | null;
  requirementId: string;
  isStarting: boolean;
  onStart: () => void;
}) {
  switch (phase) {
    case "unavailable":
      return (
        <Body>
          We cannot offer this yet. There are quotes here, and we have not set a price for reading
          them, so there is nothing to pay and nothing you can do about it from this screen.
        </Body>
      );
    case "not_yet":
      return (
        <Body>
          Nothing is charged until at least one professional has sent a complete quote. When one has,
          you will be able to read it here.
        </Body>
      );
    case "purchasable":
    case "failed":
      return (
        <View className="gap-3">
          {phase === "failed" ? (
            <>
              <Text className="font-medium text-text">That payment did not go through</Text>
              <Body>You have not been charged. The quotes are still here and still yours to unlock.</Body>
            </>
          ) : (
            <Body>
              Unlocking shows you the full scope, price and terms of every quote above, and who sent
              them. You are charged once for this request — not per quote, and not again if you come
              back later.
            </Body>
          )}
          <Button block loading={isStarting} loadingLabel="Starting your payment" disabled={priceLabel === null} onPress={onStart}>
            {phase === "failed"
              ? priceLabel === null
                ? "Try again"
                : `Try again — ${priceLabel}`
              : priceLabel === null
                ? "Unlock the quotes"
                : `Unlock the quotes for ${priceLabel}`}
          </Button>
        </View>
      );
    case "pending":
      return (
        <View accessibilityLiveRegion="polite" className="gap-1">
          <Text className="font-medium text-text">We are confirming your payment</Text>
          <Body>
            Your bank or UPI app tells us the outcome, and that can take a few minutes — sometimes
            longer. This screen updates itself when it arrives. Do not pay again: if the first payment
            goes through afterwards, you would have paid twice for one request.
          </Body>
        </View>
      );
    case "granted":
      return (
        <View className="gap-3">
          <Text className="font-medium text-text">You have unlocked these quotes</Text>
          <Body>Read them in full, compare them and choose one. This is paid for once — coming back later costs nothing.</Body>
          <Link href={requestQuotesHref(requirementId) as never} asChild>
            <Pressable accessibilityRole="button" className={buttonStyles({ block: true })}>
              <Text className="text-sm font-semibold text-white">Read the quotes</Text>
            </Pressable>
          </Link>
        </View>
      );
    case "refunded":
      return (
        <Body>
          We refunded what you paid to unlock these quotes, in full. That happens when the date you
          needed the work by passed, or when every professional who quoted fell through before you
          chose one.
        </Body>
      );
    default:
      return <Body>We cannot describe where this request stands right now. Nothing has been charged.</Body>;
  }
}

/* ------------------------------------------------------------------------------------------
   A5: the visit plan, paid once when the first professional confirms a time
   ------------------------------------------------------------------------------------------ */

function A5Access({ requirementId, supportAction }: RequestAccessPanelProps) {
  const planQuery = useVisitPlan(requirementId);
  const checkout = useStartVisitPlanCheckout();
  const completeOrOpenCheckout = useCompleteOrOpenCheckout();
  const profileGate = useProfileCompletionGate("payment");
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [handoffError, setHandoffError] = useState<unknown>(null);

  const state = planQuery.data ?? null;
  const phase: VisitPlanPhase = state === null ? "choosing" : visitPlanPhase(state);
  const view = state === null ? null : toPlanCheckoutView(state);
  const tracker = state === null ? null : toVisitTrackerView(state);
  const checkoutAvailable = state !== null && canCheckOutVisitPlan(state);
  const paymentAttemptId = state?.plan?.payment_attempt_id ?? null;
  const canResumePayment = state?.plan?.status === "PENDING" && paymentAttemptId !== null;
  const isStarting = checkout.isPending || isHandingOff;

  async function handOff(attemptId: string) {
    setHandoffError(null);
    setIsHandingOff(true);
    try {
      await completeOrOpenCheckout(String(attemptId));
      void planQuery.refetch();
    } catch (error) {
      setHandoffError(error);
    } finally {
      setIsHandingOff(false);
    }
  }

  function startCheckout() {
    if (view === null) return;
    checkout.mutate(
      { requirementId, planId: view.planId, isRetryAfterFailure: phase === "failed" },
      { onSuccess: (started) => void handOff(started.payment_attempt_id) },
    );
  }

  /** The web shows the fee breakdown before charging; the phone confirms it the same way. */
  function confirmAndPay() {
    if (view === null) return;
    const lines = [
      `${view.planSize === 1 ? "1 visit" : `${view.planSize} visits`}: ${view.priceLabel}`,
      view.creditLabel === null ? null : `Credit applied: ${view.creditLabel}`,
      `You pay now: ${view.chargeableLabel}`,
      "Paid once for the whole plan. Any slot nobody fills refunds its share on its own.",
    ].filter((line): line is string => line !== null);
    Alert.alert("Pay for your visits", lines.join("\n"), [
      { text: "Not now", style: "cancel" },
      { text: `Pay ${view.chargeableLabel}`, onPress: () => profileGate.run(startCheckout) },
    ]);
  }

  if (planQuery.isPending) return <Skeleton className="h-40 w-full" />;
  if (planQuery.error) {
    return (
      <AccessRefusal
        error={planQuery.error}
        attempting="see the visits on this request"
        supportAction={supportAction}
        onRetry={() => void planQuery.refetch()}
        inline={false}
      />
    );
  }

  const paid = phase === "active" || phase === "settled";
  const status = paid
    ? { label: "Paid", tone: "success" as const }
    : phase === "pending"
      ? { label: "Confirming", tone: "info" as const }
      : checkoutAvailable
        ? { label: "Ready", tone: "warning" as const }
        : { label: "Not charged", tone: "neutral" as const };

  return (
    <Card>
      <View className="flex-row items-start justify-between gap-3">
        <View>
          <Text className="text-xs font-extrabold uppercase text-text-muted">
            {tracker === null ? "Site visits" : tracker.liveSlots === 1 ? "1 visit" : `${tracker.liveSlots} visits`}
          </Text>
          {tracker !== null ? (
            <Text className="mt-0.5 text-2xl font-extrabold text-text">
              {view?.chargeableLabel ?? tracker.priceLabel}
            </Text>
          ) : null}
        </View>
        <Badge tone={status.tone}>{status.label}</Badge>
      </View>

      <VisitPlanNotice phase={phase} tracker={tracker} />

      {checkoutAvailable ? (
        <Button block size="lg" loading={isStarting} loadingLabel="Starting your payment" onPress={confirmAndPay}>
          {`${phase === "failed" ? "Try again" : "Pay"} ${view?.chargeableLabel ?? tracker?.priceLabel ?? ""} and lock the visits`}
        </Button>
      ) : phase === "pending" && canResumePayment ? (
        <Button
          variant="outline"
          block
          loading={isStarting}
          loadingLabel="Opening payment"
          onPress={() => profileGate.run(() => void handOff(String(paymentAttemptId)))}
        >
          Continue payment
        </Button>
      ) : null}

      <AccessRefusal error={checkout.error ?? handoffError} attempting="pay for these visits" supportAction={supportAction} />

      {tracker !== null && tracker.rows.length > 0 ? (
        <View className="gap-2 border-t border-line pt-3">
          {tracker.rows.map((row) => {
            const when = formatVisitSlot(row.scheduledFor, row.timeZone) ?? "Time not set yet";
            const label = VISIT_STATE_LABEL[row.state] ?? row.state;
            const content = (
              <View className="flex-row items-center justify-between gap-3 rounded-card border border-line p-3">
                <View className="min-w-0 flex-1">
                  <Text className="font-medium text-text">{`Visit ${row.position + 1}`}</Text>
                  <Text className="text-sm text-text-secondary">{when}</Text>
                </View>
                <Badge tone="neutral">{label}</Badge>
              </View>
            );
            return row.visitId === null ? (
              <View key={row.id}>{content}</View>
            ) : (
              <Link key={row.id} href={visitHref(requirementId, row.visitId) as never} asChild>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open visit ${row.position + 1}`}>
                  {content}
                </Pressable>
              </Link>
            );
          })}
        </View>
      ) : null}
      {profileGate.dialog}
    </Card>
  );
}

const VISIT_STATE_LABEL: Record<string, string> = {
  awaiting: "Waiting for a professional",
  held: "Held for you",
  scheduled: "Booked",
  in_progress: "In progress",
  completed: "Done",
  cancelled: "Cancelled",
  vendor_no_show: "Professional did not come",
  customer_no_show: "Missed",
  unmatched: "Nobody took it",
  dropped: "Dropped",
};

function VisitPlanNotice({ phase, tracker }: { phase: VisitPlanPhase; tracker: VisitTrackerView | null }) {
  const size = tracker?.planSize ?? 0;
  const price = tracker?.priceLabel ?? null;
  switch (phase) {
    case "unpriced":
      return <Body>We cannot offer site visits for this yet. Nothing has been charged.</Body>;
    case "choosing":
      return <Body>You have not chosen how many professionals should visit. Nothing has been charged.</Body>;
    case "chosen":
      return (
        <Body>
          {`You asked for ${size === 1 ? "one professional" : `${size} professionals`} to visit and estimate on site. Nothing has been charged. You pay ${price ?? "for the plan"} once, when the first one confirms a time.`}
        </Body>
      );
    case "pending":
      return (
        <Body>
          We are confirming your payment for these visits. Your bank or UPI app tells us the outcome
          and that can take a few minutes. Do not pay again — this screen updates itself.
        </Body>
      );
    case "active":
      return (
        <Body>
          {`You paid ${price ?? "for the plan"} for ${size === 1 ? "one visit" : `${size} visits`}. Any slot nobody fills refunds its share of that on its own — you do not have to ask.`}
        </Body>
      );
    case "failed":
      return (
        <Body>
          The payment for these visits did not go through, so you have not been charged and the slot
          that was being held has gone back.
        </Body>
      );
    case "void":
      return <Body>This request closed before any professional confirmed a visit. Nothing was charged.</Body>;
    case "settled":
      return <Body>Every visit on this plan is settled — paid to the professional who came, or refunded to you.</Body>;
    default:
      return <Body>We cannot describe where these visits stand right now.</Body>;
  }
}
