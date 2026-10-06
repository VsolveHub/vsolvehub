// Ported from frontend/apps/customer/features/bookings/view/group-detail.tsx
import { describeError, useServerCountdown } from "@vsolve/query/native";
import { Button, Dialog, ErrorState, Skeleton, Text, Textarea, buttonStyles } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { bookingVisitHref } from "@/lib/routes";
import { Money } from "@/features/payment/view/money";

import {
  isCancellationRefused,
  isGroupVersionConflict,
  isPartnerOnTheWayOrBeyond,
  isTerminal,
  useBookingGroup,
  useCancelBookingGroup,
  type BookingGroup,
  type FulfilmentUnit,
} from "../queries";
import { AssignmentProgress } from "./assignment-progress";
import { formatBookingWhen } from "./booking-format";
import { FullScreenPartnerSearch } from "./full-screen-search";
import { GROUP_STATUS_LABELS, GroupStatusBadge, UnitStatusBadge } from "./group-status";
import { MockProfessionalCard } from "./mock-professional-card";
import {
  MultiVisitOverviewCard,
  PaidGroupPaymentCard,
  PaidVisitPaymentCard,
  SingleVisitDetailCard,
} from "./paid-visit-cards";
import { MobilePaymentBottomBar } from "./payment-summary-card";
import { ProfessionalCard } from "./professional-card";
import { VisitProgress } from "./visit-progress";
import { VisitStartCode } from "./visit-start-code";

function BackToBookingsLink() {
  return (
    <Link href="/activity" asChild>
      <Pressable className={buttonStyles({ variant: "outline", size: "sm", className: "w-fit gap-1 px-3" })}>
        <ChevronLeft size={16} color="#00112e" />
        <Text className="text-xs font-semibold text-text">Back to Bookings</Text>
      </Pressable>
    </Link>
  );
}

function UnitCard({
  unit,
  index,
  total,
  groupId,
  isPaid,
}: {
  unit: FulfilmentUnit;
  index: number;
  total: number;
  groupId: string;
  isPaid: boolean;
}) {
  const deadline = useServerCountdown(unit.state_deadline, 1000);
  return (
    <View className="rounded-card border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text className="text-sm font-semibold text-text">
          Visit {index + 1} of {total}
        </Text>
        <UnitStatusBadge unit={unit} />
      </View>
      <Text className="mt-1 text-sm text-text-secondary">
        {formatBookingWhen(unit.starts_at)}
        {" · arrival window "}
        {unit.arrival_window_minutes} min · about {unit.estimated_duration_minutes} min of work
      </Text>
      {deadline && !deadline.isExpired ? (
        <Text className="mt-1 text-sm text-text-secondary">
          {deadline.display} until the next step on this visit
        </Text>
      ) : null}
      {unit.booking_status ? (
        <View className="mt-3">
          <VisitProgress status={unit.booking_status} />
        </View>
      ) : null}
      {unit.booking_id && unit.booking_status ? (
        <View className="mt-3">
          <VisitStartCode bookingId={unit.booking_id} status={unit.booking_status} />
        </View>
      ) : null}
      {unit.professional && isPaid ? (
        <View className="mt-3 gap-1.5">
          <View className="flex-row items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5">
            <Text className="text-xs font-semibold text-emerald-700">✓ Real Partner Details Unlocked</Text>
          </View>
          <ProfessionalCard professional={unit.professional} />
        </View>
      ) : unit.professional || unit.status === "HELD" || unit.status === "PAYMENT_PENDING" ? (
        <View className="mt-3">
          <MockProfessionalCard serviceName={unit.lines[0]?.label} />
        </View>
      ) : null}
      {unit.status === "RECOVERY_REQUIRED" ? (
        <Text className="mt-3 rounded-control bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
          Your professional had to step back. We are assigning someone else now — if we cannot, this visit is cancelled and refunded in full automatically.
        </Text>
      ) : null}
      <View className="mt-4 gap-1 border-t border-line pt-3">
        {unit.lines.map((line) => (
          <View key={line.id} className="flex-row justify-between gap-3">
            <Text className="text-sm text-text">
              {line.label}
              {line.quantity > 1 ? <Text className="text-text-secondary"> × {line.quantity}</Text> : null}
            </Text>
            <Money value={line.amount} className="shrink-0 text-sm tabular-nums text-text-secondary" />
          </View>
        ))}
      </View>
      <View className="mt-3 flex-row justify-between">
        <Text className="text-sm font-semibold text-text">Visit total</Text>
        <Money value={unit.total} className="text-sm font-semibold tabular-nums text-text" />
      </View>
      {unit.booking_id ? (
        <Link href={bookingVisitHref(groupId, unit.booking_id)} asChild>
          <Pressable className="mt-3 min-h-11 justify-center">
            <Text className="text-sm font-semibold text-text-link">Track this visit</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

const CANCELLATION_REASONS = [
  "Wait time is too long / Schedule conflict",
  "Booked by mistake",
  "Found an alternative service provider",
  "Pricing or budget concerns",
  "Need to change service details or address",
  "Other reason",
];

function CancelSupportDialog({
  group,
  isOpen,
  isCancelling,
  errorMessage,
  onConfirm,
  onClose,
}: {
  group: BookingGroup;
  isOpen: boolean;
  isCancelling: boolean;
  errorMessage: string | null;
  onConfirm: (reason: string, feedback: string) => void;
  onClose: () => void;
}) {
  const assignedProfessional = group.units.find((unit) => unit.professional != null)?.professional;
  const isPartnerAssigned = Boolean(assignedProfessional);
  const [selectedReason, setSelectedReason] = useState(CANCELLATION_REASONS[0]);
  const [feedbackText, setFeedbackText] = useState("");

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !isCancelling) onClose();
      }}
      dismissable={!isCancelling}
      title="Cancel this booking?"
      description={`All ${group.units.length} ${
        group.units.length === 1 ? "visit" : "visits"
      } will be cancelled together. Nothing has been charged, so there is nothing to refund.`}
    >
      <View className="gap-4">
        <View className="rounded-md border border-line bg-surface-sunken p-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-text">Assignment Status</Text>
            <Text
              className={`rounded px-2 py-0.5 text-xs font-bold ${
                isPartnerAssigned ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isPartnerAssigned ? "Partner Assigned" : "Searching for Partner"}
            </Text>
          </View>
          <Text className="mt-1 text-xs text-text-secondary">
            {isPartnerAssigned
              ? `Professional ${assignedProfessional?.display_name} is reserved for your service. Cancelling now will release their hold.`
              : "We are matching your request with nearby service professionals."}
          </Text>
        </View>
        <View>
          <Text className="mb-2 text-sm font-semibold text-text">Why do you want to cancel?</Text>
          <View className="gap-1.5">
            {CANCELLATION_REASONS.map((reason) => (
              <Pressable
                key={reason}
                accessibilityRole="button"
                onPress={() => setSelectedReason(reason)}
                className={`flex-row items-center gap-3 rounded-md border p-2.5 ${
                  selectedReason === reason ? "border-brand-600 bg-brand-50/20" : "border-line bg-surface"
                }`}
              >
                <View
                  className={`size-4 rounded-full border ${
                    selectedReason === reason ? "border-brand-600 bg-brand-600" : "border-line"
                  }`}
                />
                <Text className={`flex-1 text-sm ${selectedReason === reason ? "font-medium text-text" : "text-text"}`}>
                  {reason}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View>
          <Text className="mb-1 text-sm font-semibold text-text">Additional Feedback (Optional)</Text>
          <Textarea
            rows={2}
            className="w-full rounded-md border border-line bg-surface p-2 text-sm text-text"
            placeholder="Help us improve by telling us what went wrong..."
            value={feedbackText}
            onChangeText={setFeedbackText}
          />
        </View>
        {errorMessage !== null ? (
          <Text className="text-sm text-critical" accessibilityRole="alert">
            {errorMessage}
          </Text>
        ) : null}
        <View className="mt-5 flex-row flex-wrap gap-3 border-t border-line pt-2">
          <Button
            variant="danger"
            onPress={() => onConfirm(selectedReason ?? CANCELLATION_REASONS[0] ?? "", feedbackText)}
            loading={isCancelling}
            loadingLabel="Cancelling"
          >
            Cancel this booking
          </Button>
          <Button variant="outline" onPress={onClose} disabled={isCancelling}>
            Keep it
          </Button>
        </View>
      </View>
    </Dialog>
  );
}

export function GroupDetail({ groupId }: { groupId: string }) {
  const groupQuery = useBookingGroup(groupId);
  const cancelGroup = useCancelBookingGroup();
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isSearchDismissed, setIsSearchDismissed] = useState(false);
  const group = groupQuery.data;
  const expiry = useServerCountdown(group?.expires_at ?? null, 1000);

  if (groupQuery.isPending) {
    return (
      <View className="flex-1 gap-3 bg-canvas px-4 py-6">
        <BackToBookingsLink />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </View>
    );
  }

  if (groupQuery.isError || !group) {
    return (
      <View className="flex-1 gap-4 bg-canvas px-4 py-6">
        <BackToBookingsLink />
        <ErrorState
          title="We could not load this booking"
          message={describeError(groupQuery.error, "read").message}
          actionLabel="Try again"
          onAction={() => void groupQuery.refetch()}
        />
      </View>
    );
  }

  const isPaid = group.order_id !== null || group.status === "BOOKED" || group.status === "COMPLETED";
  const isAwaitingPayment =
    !isPaid &&
    (group.recovery_action === "PAYMENT_REQUIRED" ||
      group.status === "PAYMENT_PENDING" ||
      group.status === "ALL_UNITS_HELD");
  const isSearching =
    !isPaid &&
    !isAwaitingPayment &&
    (group.status === "CONFIRMED" || group.status === "MATCHING" || group.status === "PARTIALLY_HELD") &&
    !isSearchDismissed;
  const isPartnerOnTheWay = isPartnerOnTheWayOrBeyond(group);
  const canCancel = !isTerminal(group) && !isPartnerOnTheWay;
  const canRefresh = !isTerminal(group) && !isPartnerOnTheWay;
  const isSinglePaidVisit = isPaid && group.units.length === 1;
  const isMultiPaidVisit = isPaid && group.units.length > 1;
  const showBookingSummaryCard =
    !isAwaitingPayment && group.status !== "BOOKED" && group.status !== "COMPLETED";

  function describeCancelFailure(error: unknown): string {
    if (isGroupVersionConflict(error)) {
      return "This booking changed while you were deciding, so we did not cancel it. We have reloaded it — check where it is now before trying again.";
    }
    if (isCancellationRefused(error)) {
      return "This booking can no longer be cancelled from here. Please contact support.";
    }
    return describeError(error, "mutation").message;
  }

  return (
    <View className="flex-1 bg-canvas">
      {isSearching ? <FullScreenPartnerSearch group={group} onDismiss={() => setIsSearchDismissed(true)} /> : null}
      <ScrollView contentContainerClassName={isAwaitingPayment ? "gap-4 px-4 pb-8 pt-4" : "gap-4 px-4 pb-8 pt-4"}>
        <BackToBookingsLink />
        {isMultiPaidVisit ? <Text className="text-2xl font-bold text-text">Your visits</Text> : null}
        {showBookingSummaryCard ? (
          <View className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <View className="flex-row flex-wrap items-start justify-between gap-3">
              <View>
                <Text className="text-2xl font-bold text-text">
                  {isSinglePaidVisit
                    ? "Your booking"
                    : `${group.units.length} ${group.units.length === 1 ? "visit" : "visits"}`}
                </Text>
                <Text className="mt-1 text-sm text-text-secondary">Booked {formatBookingWhen(group.created_at)}</Text>
              </View>
              <GroupStatusBadge group={group} />
            </View>
            <View className="mt-4">
              <AssignmentProgress group={group} />
            </View>
            {group.order_id !== null && !isSinglePaidVisit && !isMultiPaidVisit ? (
              <Link href={`/bookings/${group.id}/receipt`} asChild>
                <Pressable className={buttonStyles({ variant: "outline", className: "mt-4" })}>
                  <Text className="text-sm font-semibold text-text">View your receipt</Text>
                </Pressable>
              </Link>
            ) : null}
            {expiry && !expiry.isExpired && !isTerminal(group) ? (
              <View className="mt-4 gap-3 rounded-xl border border-line bg-warm-100/70 p-3">
                <Text className="text-xs font-medium text-text">
                  ⏱️ {expiry.display} before this booking expires if we cannot fill every visit
                </Text>
                <Text className="text-xs font-semibold text-emerald-700">Live matching active</Text>
              </View>
            ) : null}
            <Text className="mt-3 text-xs text-text-secondary">
              {groupQuery.isFetching
                ? "Checking for updates…"
                : groupQuery.isError
                  ? "We could not check for updates just now."
                  : isTerminal(group)
                    ? "This booking is finished, so it will not change again."
                    : isPartnerOnTheWay
                      ? "Your professional is on the way or work is in progress."
                      : "Updating automatically. You can close this page — it keeps going without it."}
            </Text>
          </View>
        ) : null}

        <View className="gap-4">
          {isSinglePaidVisit && group.units[0] !== undefined ? (
            <SingleVisitDetailCard unit={group.units[0]} isPaid={isPaid} />
          ) : isMultiPaidVisit ? (
            <View className="gap-3">
              {group.units.map((unit, index) => (
                <MultiVisitOverviewCard
                  key={unit.id}
                  unit={unit}
                  index={index}
                  total={group.units.length}
                  groupId={group.id}
                  isPaid={isPaid}
                />
              ))}
            </View>
          ) : (
            <View className="gap-3">
              {group.units.map((unit, index) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  index={index}
                  total={group.units.length}
                  groupId={group.id}
                  isPaid={isPaid}
                />
              ))}
            </View>
          )}

          {isAwaitingPayment ? (
            <View>
              {canRefresh || canCancel ? (
                <View className="mt-6 flex-row flex-wrap gap-3">
                  {canRefresh ? (
                    <Button variant="outline" onPress={() => void groupQuery.refetch()} disabled={groupQuery.isFetching}>
                      Refresh now
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button variant="ghost" onPress={() => setIsCancelOpen(true)}>
                      Cancel this booking
                    </Button>
                  ) : null}
                </View>
              ) : null}
              {cancelGroup.isError && !isCancelOpen ? (
                <Text className="mt-3 text-sm text-critical" accessibilityRole="alert">
                  {describeCancelFailure(cancelGroup.error)}
                </Text>
              ) : null}
              <Text className="mt-4 text-xs text-text-secondary">
                Reference <Text className="font-mono text-xs tabular-nums text-text-secondary">{group.id}</Text>
              </Text>
            </View>
          ) : null}

          {isSinglePaidVisit && group.units[0] !== undefined ? (
            <PaidVisitPaymentCard unit={group.units[0]} groupId={group.id} orderId={group.order_id} />
          ) : null}
          {isMultiPaidVisit ? <PaidGroupPaymentCard group={group} /> : null}
        </View>

        {!isAwaitingPayment ? (
          <View className="gap-6">
            {canRefresh || canCancel ? (
              <View className="flex-row flex-wrap gap-3">
                {canRefresh ? (
                  <Button variant="outline" onPress={() => void groupQuery.refetch()} disabled={groupQuery.isFetching}>
                    Refresh now
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button variant="ghost" onPress={() => setIsCancelOpen(true)}>
                    Cancel this booking
                  </Button>
                ) : null}
              </View>
            ) : null}
            {cancelGroup.isError && !isCancelOpen ? (
              <Text className="text-sm text-critical" accessibilityRole="alert">
                {describeCancelFailure(cancelGroup.error)}
              </Text>
            ) : null}
            <Text className="text-xs text-text-secondary">
              Reference <Text className="font-mono text-xs tabular-nums text-text-secondary">{group.id}</Text>
            </Text>
          </View>
        ) : null}

        <CancelSupportDialog
          group={group}
          isOpen={isCancelOpen}
          isCancelling={cancelGroup.isPending}
          errorMessage={cancelGroup.isError ? describeCancelFailure(cancelGroup.error) : null}
          onConfirm={() =>
            cancelGroup.mutate(
              { groupId: group.id, expectedVersion: group.version },
              { onSuccess: () => setIsCancelOpen(false) },
            )
          }
          onClose={() => {
            cancelGroup.reset();
            setIsCancelOpen(false);
          }}
        />
      </ScrollView>
      {isAwaitingPayment ? <MobilePaymentBottomBar group={group} /> : null}
    </View>
  );
}

export { GROUP_STATUS_LABELS };
