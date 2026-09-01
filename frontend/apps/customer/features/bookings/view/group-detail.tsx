"use client";

import { describeError, useServerCountdown } from "@vsolve/query";
import { Button, Dialog, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Money } from "@/features/checkout/view/money";
import { BookingSupport } from "@/features/support/view/booking-support";
import { bookingVisitHref } from "@/lib/routes";

import { formatBookingWhen } from "./booking-format";
import {
  canShowVisitFeedback,
  CompletedVisitsFeedback,
  VisitFeedbackForm,
} from "@/features/ratings/view/visit-feedback-form";

import {
  PaidGroupPaymentCard,
  PaidVisitPaymentCard,
  MultiVisitOverviewCard,
  SingleVisitDetailCard,
} from "./paid-visit-cards";
import { ProfessionalCard } from "./professional-card";
import { VisitProgress } from "./visit-progress";
import { VisitStartCode } from "./visit-start-code";

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
import {
  GROUP_STATUS_LABELS,
  GroupStatusBadge,
  UnitStatusBadge,
} from "./group-status";
import { FullScreenPartnerSearch } from "./full-screen-search";
import { MockProfessionalCard } from "./mock-professional-card";
import { MobilePaymentBottomBar, PaymentSummarySideCard } from "./payment-summary-card";

/**
 * One Booking Group, watched while the platform works on it.
 *
 * ## This screen does not drive anything
 *
 * Confirmation emitted a transactional outbox event; Celery owns every deadline
 * from there — offering each unit, expiring an offer, releasing holds, timing out
 * the search. This component polls a read and renders what came back. Closing the
 * tab changes nothing, which is the property that makes the poll safe to stop
 * whenever it is not useful.
 *
 * There is a published `POST /checkouts/{id}/search/advance/`. It is the legacy
 * singleton progression path and is deliberately never called from here; the
 * boundary test asserts that it stays that way.
 *
 * ## What the Customer is told about the Partner
 *
 * Since contract 1.20.0 a unit publishes `professional` — display name, a
 * headline built from their approved services, and years of experience — but
 * only once a Booking exists. Somebody letting a stranger into their home is
 * entitled to know who is arriving.
 *
 * `null` until assignment, and this component must not invent a stand-in for
 * someone who has not accepted — unit copy stays about the *unit* until there is
 * a real person to name.
 */


function BackToBookingsLink() {
  return (
    <Link
      href="/activity"
      className={buttonStyles({
        variant: "outline",
        size: "sm",
        className: "w-fit gap-1 px-3",
      })}
    >
      <ChevronLeft className="size-4" strokeWidth={2.2} aria-hidden />
      Back to Bookings
    </Link>
  );
}

/**
 * A unit's own state, with no reference to its siblings.
 *
 * Each unit renders from its own fields only. A unit that failed does not make
 * the others look failed, and a unit that is held does not make the booking look
 * confirmed — the group heading above is the only place the whole is described.
 */
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
    <li className="rounded-card border border-line bg-surface p-4 transition-all hover:border-line-strong shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          Visit {index + 1} of {total}
        </h3>
        <UnitStatusBadge unit={unit} />
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        <time dateTime={unit.starts_at}>{formatBookingWhen(unit.starts_at)}</time>
        {" · arrival window "}
        {unit.arrival_window_minutes} min · about {unit.estimated_duration_minutes} min of work
      </p>

      {deadline && !deadline.isExpired ? (
        <p className="mt-1 text-sm text-text-secondary">
          <span aria-hidden data-numeric>
            {deadline.display}
          </span>
          <span className="sr-only">{deadline.announce}</span>
          <span> until the next step on this visit</span>
        </p>
      ) : null}

      {/* Where the visit has got to, and who is bringing it. */}
      {unit.booking_status ? (
        <div className="mt-3">
          <VisitProgress status={unit.booking_status} />
        </div>
      ) : null}

      {unit.booking_id && unit.booking_status ? (
        <div className="mt-3">
          <VisitStartCode bookingId={unit.booking_id} status={unit.booking_status} />
        </div>
      ) : null}

      {/* Professional details: generic Mock card pre-payment, Real partner details post-payment */}
      {unit.professional && isPaid ? (
        <div className="mt-3 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
            <span>✓</span>
            <span>Real Partner Details Unlocked</span>
          </div>
          <ProfessionalCard professional={unit.professional} />
        </div>
      ) : unit.professional || unit.status === "HELD" || unit.status === "PAYMENT_PENDING" ? (
        <div className="mt-3">
          <MockProfessionalCard serviceName={unit.lines[0]?.label} />
        </div>
      ) : null}

      {/*
        Django sends no `professional` while a replacement is being found, because the one on
        the Booking row is whoever stepped back. This says so rather than leaving the space
        blank, and it is where the empty card used to contradict the badge above it.
      */}
      {unit.status === "RECOVERY_REQUIRED" ? (
        <p className="mt-3 rounded-control bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
          Your professional had to step back. We are assigning someone else now — if we cannot,
          this visit is cancelled and refunded in full automatically.
        </p>
      ) : null}

      <ul className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-sm">
        {unit.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3">
            <span className="text-text">
              {line.label}
              {line.quantity > 1 ? (
                <span className="text-text-secondary"> × {line.quantity}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-text-secondary">
              <Money value={line.amount} />
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex justify-between text-sm font-semibold text-text">
        <span>Visit total</span>
        <Money value={unit.total} className="tabular-nums" />
      </p>

      {/* Only once the unit has become a real Booking. */}
      {unit.booking_id ? (
        <Link
          href={bookingVisitHref(groupId, unit.booking_id)}
          prefetch={false}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-text-link hover:underline"
        >
          Track this visit
        </Link>
      ) : null}
    </li>
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

/**
 * Cancellation support dialog & feedback collection mockup.
 */
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
  const assignedProfessional = group.units.find((u) => u.professional != null)?.professional;
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
      <div className="p-5 space-y-4">
        {/* Partner assignment context */}
        <div className="rounded-md border border-line bg-surface-sunken p-3 text-sm">
          <div className="flex items-center justify-between font-semibold text-text">
            <span>Assignment Status</span>
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                isPartnerAssigned ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isPartnerAssigned ? "Partner Assigned" : "Searching for Partner"}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {isPartnerAssigned
              ? `Professional ${assignedProfessional?.display_name} is reserved for your service. Cancelling now will release their hold.`
              : "We are matching your request with nearby service professionals."}
          </p>
        </div>

        {/* Cancellation reason feedback selection */}
        <div>
          <label className="block text-sm font-semibold text-text mb-2">
            Why do you want to cancel?
          </label>
          <div className="space-y-1.5">
            {CANCELLATION_REASONS.map((reason) => (
              <label
                key={reason}
                className={`flex items-center gap-3 rounded-md border p-2.5 text-sm cursor-pointer transition-colors ${
                  selectedReason === reason
                    ? "border-brand-600 bg-brand-50/20 font-medium"
                    : "border-line bg-surface hover:bg-surface-sunken"
                }`}
              >
                <input
                  type="radio"
                  name="cancellation-reason"
                  checked={selectedReason === reason}
                  onChange={() => setSelectedReason(reason)}
                  className="accent-brand-600"
                />
                <span>{reason}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Detailed feedback text */}
        <div>
          <label htmlFor="cancellation-feedback" className="block text-sm font-semibold text-text mb-1">
            Additional Feedback (Optional)
          </label>
          <textarea
            id="cancellation-feedback"
            rows={2}
            className="w-full rounded-md border border-line bg-surface p-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-brand-600"
            placeholder="Help us improve by telling us what went wrong..."
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
          />
        </div>

        {errorMessage !== null ? (
          <p className="text-sm text-critical" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3 pt-2 border-t border-line">
          <Button
            variant="danger"
            onClick={() => onConfirm(selectedReason, feedbackText)}
            loading={isCancelling}
            loadingLabel="Cancelling"
          >
            Cancel this booking
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isCancelling}>
            Keep it
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function BookingGroupDetail({ groupId }: { groupId: string }) {
  const groupQuery = useBookingGroup(groupId);
  const cancelGroup = useCancelBookingGroup();
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isSearchDismissed, setIsSearchDismissed] = useState(false);

  const group = groupQuery.data;
  const expiry = useServerCountdown(group?.expires_at ?? null, 1000);

  if (groupQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <BackToBookingsLink />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (groupQuery.isError || !group) {
    return (
      <div className="flex flex-col gap-4">
        <BackToBookingsLink />
        <ErrorState
          title="We could not load this booking"
          message={describeError(groupQuery.error, "read").message}
          actionLabel="Try again"
          onAction={() => void groupQuery.refetch()}
        />
      </div>
    );
  }

  const isPaid =
    group.order_id !== null ||
    group.status === "BOOKED" ||
    group.status === "COMPLETED";
  const isAwaitingPayment =
    !isPaid &&
    (group.recovery_action === "PAYMENT_REQUIRED" ||
      group.status === "PAYMENT_PENDING" ||
      group.status === "ALL_UNITS_HELD");

  const isSearching =
    !isPaid &&
    !isAwaitingPayment &&
    (group.status === "CONFIRMED" ||
      group.status === "MATCHING" ||
      group.status === "PARTIALLY_HELD") &&
    !isSearchDismissed;

  const isPartnerOnTheWay = isPartnerOnTheWayOrBeyond(group);
  const canCancel = !isTerminal(group) && !isPartnerOnTheWay;
  const canRefresh = !isTerminal(group) && !isPartnerOnTheWay;
  const isSinglePaidVisit = isPaid && group.units.length === 1;
  /*
    The id of the one visit to ask about, or null.

    Computed here rather than inside the JSX because this is where the null
    check can actually narrow: `canShowVisitFeedback` returns a boolean (see its
    own note on why it is not a type predicate), so the guarantee that
    `VisitFeedbackForm` needs -- a real id -- has to come from testing the value
    being handed to it.
  */
  const singleVisitFeedbackUnit = isSinglePaidVisit ? group.units[0] : undefined;
  const singleVisitFeedbackId =
    singleVisitFeedbackUnit !== undefined &&
    singleVisitFeedbackUnit.booking_id !== null &&
    canShowVisitFeedback({
      bookingId: singleVisitFeedbackUnit.booking_id,
      isPaid,
      unitStatus: singleVisitFeedbackUnit.status,
      bookingStatus: singleVisitFeedbackUnit.booking_status,
    })
      ? singleVisitFeedbackUnit.booking_id
      : null;
  const isMultiPaidVisit = isPaid && group.units.length > 1;
  const usesTwoColumn = isAwaitingPayment || isSinglePaidVisit || isMultiPaidVisit;
  const isSingleVisitHelp =
    group.units.length === 1 &&
    !isAwaitingPayment &&
    (isPaid || group.status === "CANCELLED");

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
    <>
      {isSearching ? (
        <FullScreenPartnerSearch
          group={group}
          onDismiss={() => setIsSearchDismissed(true)}
        />
      ) : null}

      <div
        className={
          isAwaitingPayment
            ? "space-y-4 pb-28 lg:pb-12"
            : "space-y-4 pb-20 lg:pb-12"
        }
      >
        <BackToBookingsLink />
        {/* Header section with status badge (shown when !isAwaitingPayment; when awaiting payment, details live in PaymentSummarySideCard) */}
        {!isAwaitingPayment ? (
          <div className="rounded-card border border-line bg-surface p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-text">
                  {isSinglePaidVisit
                    ? "Your booking"
                    : `${group.units.length} ${group.units.length === 1 ? "visit" : "visits"}`}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Booked {formatBookingWhen(group.created_at)}
                </p>
              </div>
              <GroupStatusBadge group={group} />
            </div>

            <div className="mt-4">
              <AssignmentProgress group={group} />
            </div>

            {group.order_id !== null && !isSinglePaidVisit && !isMultiPaidVisit ? (
              <div className="mt-4">
                <Link
                  href={`/bookings/${group.id}/receipt`}
                  className={buttonStyles({ variant: "outline" })}
                >
                  View your receipt
                </Link>
              </div>
            ) : null}

            {expiry && !expiry.isExpired && !isTerminal(group) ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warm-100/70 border border-line p-3 text-xs text-text-secondary">
                <p className="flex items-center gap-2 font-medium text-text">
                  <span className="text-base">⏱️</span>
                  <span>
                    <span aria-hidden data-numeric className="font-bold text-navy-900">
                      {expiry.display}
                    </span>
                    <span className="sr-only">{expiry.announce}</span>
                    <span> before this booking expires if we cannot fill every visit</span>
                  </span>
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                  Live matching active
                </span>
              </div>
            ) : null}

            <p className="mt-3 text-xs text-text-secondary" aria-live="polite">
              {groupQuery.isFetching
                ? "Checking for updates…"
                : groupQuery.isError
                  ? "We could not check for updates just now."
                  : isTerminal(group)
                    ? "This booking is finished, so it will not change again."
                    : isPartnerOnTheWay
                      ? "Your professional is on the way or work is in progress."
                      : "Updating automatically. You can close this page — it keeps going without it."}
            </p>
          </div>
        ) : null}

        <div
          className={
            usesTwoColumn
              ? "lg:grid lg:grid-cols-12 lg:gap-8 items-start space-y-4 lg:space-y-0"
              : undefined
          }
        >
          <div className={usesTwoColumn ? (isAwaitingPayment ? "lg:col-span-7 min-w-0 space-y-4" : "lg:col-span-8 min-w-0 space-y-4") : "space-y-4"}>
            {isAwaitingPayment ? (
              <div className="sr-only">
                <AssignmentProgress group={group} />
              </div>
            ) : null}

            {isSinglePaidVisit && group.units[0] !== undefined ? (
              <SingleVisitDetailCard
                unit={group.units[0]}
                isPaid={isPaid}
              />
            ) : isMultiPaidVisit ? (
              <ul className="flex flex-col gap-3">
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
              </ul>
            ) : (
              <ul className="flex flex-col gap-3">
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
              </ul>
            )}

            {isAwaitingPayment ? (
              <>
                {canRefresh || canCancel ? (
                  <div className="mt-6 flex flex-wrap gap-3">
                    {canRefresh ? (
                      <Button variant="outline" onClick={() => void groupQuery.refetch()} disabled={groupQuery.isFetching}>
                        Refresh now
                      </Button>
                    ) : null}
                    {canCancel ? (
                      <Button variant="ghost" onClick={() => setIsCancelOpen(true)}>
                        Cancel this booking
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {cancelGroup.isError && !isCancelOpen ? (
                  <p className="mt-3 text-sm text-critical" role="alert">
                    {describeCancelFailure(cancelGroup.error)}
                  </p>
                ) : null}

                <p className="mt-4 text-xs text-text-secondary">
                  Reference <span className="font-mono tabular-nums">{group.id}</span>
                </p>

                <BookingSupport reference={group.id} />
              </>
            ) : null}
          </div>

          {isAwaitingPayment ? (
            <div className="hidden min-w-0 lg:col-span-5 lg:block">
              <PaymentSummarySideCard group={group} />
            </div>
          ) : null}

          {isSinglePaidVisit && group.units[0] !== undefined ? (
            <div className="min-w-0 lg:col-span-4">
              <PaidVisitPaymentCard
                unit={group.units[0]}
                groupId={group.id}
                orderId={group.order_id}
              />
            </div>
          ) : null}

          {isMultiPaidVisit ? (
            <div className="min-w-0 lg:col-span-4">
              <PaidGroupPaymentCard group={group} />
            </div>
          ) : null}
        </div>

        {!isAwaitingPayment ? (
          <div className="space-y-6">
            {canRefresh || canCancel ? (
              <div className="flex flex-wrap gap-3">
                {canRefresh ? (
                  <Button variant="outline" onClick={() => void groupQuery.refetch()} disabled={groupQuery.isFetching}>
                    Refresh now
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button variant="ghost" onClick={() => setIsCancelOpen(true)}>
                    Cancel this booking
                  </Button>
                ) : null}
              </div>
            ) : null}

            {cancelGroup.isError && !isCancelOpen ? (
              <p className="text-sm text-critical" role="alert">
                {describeCancelFailure(cancelGroup.error)}
              </p>
            ) : null}

            <p className="text-xs text-text-secondary">
              Reference <span className="font-mono tabular-nums">{group.id}</span>
            </p>

            <BookingSupport
              reference={group.id}
              variant={isSingleVisitHelp ? "faq" : "compact"}
            />
          </div>
        ) : null}

        {isAwaitingPayment ? (
          <MobilePaymentBottomBar group={group} />
        ) : null}

        {singleVisitFeedbackId === null ? null : (
          <VisitFeedbackForm bookingId={singleVisitFeedbackId} isComplete />
        )}

        {isMultiPaidVisit ? (
          <CompletedVisitsFeedback units={group.units} isPaid={isPaid} />
        ) : null}

      <CancelSupportDialog
        group={group}
        isOpen={isCancelOpen}
        isCancelling={cancelGroup.isPending}
        errorMessage={cancelGroup.isError ? describeCancelFailure(cancelGroup.error) : null}
        onConfirm={(_reason, _feedback) =>
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
      </div>
    </>
  );
}

export { GROUP_STATUS_LABELS };
