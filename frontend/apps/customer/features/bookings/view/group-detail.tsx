"use client";

import { describeError, useServerCountdown } from "@vsolve/query";
import { Button, Dialog, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { Money } from "@/features/booking/group/view/money";

import {
  isCancellationRefused,
  isGroupVersionConflict,
  isTerminal,
  useBookingGroup,
  useCancelBookingGroup,
  type BookingGroup,
  type FulfilmentUnit,
} from "../queries";
import {
  GROUP_STATUS_LABELS,
  GROUP_STATUS_MEANING,
  GroupStatusBadge,
  RECOVERY_LABELS,
  UnitStatusBadge,
  heldUnitCount,
} from "./group-status";

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
 * ## Partner identity is absent by construction
 *
 * The Customer projection carries no Partner name, phone or rating, so there is
 * nothing to hide here — the safety property lives in the contract. What this
 * component must not do is invent a stand-in ("your professional is on the way")
 * for someone who has not accepted, so unit copy stays about the *unit*.
 */

function formatWhen(instant: string): string {
  return new Date(instant).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A unit's own state, with no reference to its siblings.
 *
 * Each unit renders from its own fields only. A unit that failed does not make
 * the others look failed, and a unit that is held does not make the booking look
 * confirmed — the group heading above is the only place the whole is described.
 */
function UnitCard({ unit, index, total }: { unit: FulfilmentUnit; index: number; total: number }) {
  const deadline = useServerCountdown(unit.state_deadline, 1000);

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          Visit {index + 1} of {total}
        </h3>
        <UnitStatusBadge unit={unit} />
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        <time dateTime={unit.starts_at}>{formatWhen(unit.starts_at)}</time>
        {" · arrival window "}
        {unit.arrival_window_minutes} min · about {unit.estimated_duration_minutes} min of work
      </p>

      {deadline && !deadline.isExpired ? (
        <p className="mt-1 text-sm text-text-secondary">
          {/* Server-clock derived. The digits are hidden from assistive tech and
              replaced with a coarse phrase, so a screen reader is not read a new
              number every second. */}
          <span aria-hidden data-numeric>
            {deadline.display}
          </span>
          <span className="sr-only">{deadline.announce}</span>
          <span> until the next step on this visit</span>
        </p>
      ) : null}

      <ul className="mt-3 flex flex-col gap-1 text-sm">
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
    </li>
  );
}

/**
 * The cancellation confirmation.
 *
 * A dialog rather than an inline button because cancelling releases holds that
 * Partners have already answered, and it cannot be undone from here. It states
 * what happens to the *whole* booking, since under `ALL_OR_NOTHING` there is no
 * such thing as cancelling one visit.
 */
function CancelDialog({
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
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !isCancelling) onClose();
      }}
      // Dismissing mid-request would leave the customer unsure whether it went
      // through, which is the one case the platform says not to make dismissable.
      dismissable={!isCancelling}
      title="Cancel this booking?"
      description={`All ${group.units.length} ${
        group.units.length === 1 ? "visit" : "visits"
      } will be cancelled together. Nothing has been charged, so there is nothing to refund.`}
    >
      <div className="p-5">
        <p className="text-sm text-text-secondary">
          Any professional we have already held for you will be released. If you want these
          services later you will need to book again, and the price may differ.
        </p>

        {errorMessage !== null ? (
          <p className="mt-4 text-sm text-critical" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="danger" onClick={onConfirm} loading={isCancelling} loadingLabel="Cancelling">
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

  const group = groupQuery.data;
  const expiry = useServerCountdown(group?.expires_at ?? null, 1000);

  if (groupQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (groupQuery.isError || !group) {
    return (
      <ErrorState
        title="We could not load this booking"
        message={describeError(groupQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void groupQuery.refetch()}
      />
    );
  }

  const recovery = RECOVERY_LABELS[group.recovery_action];
  const held = heldUnitCount(group);
  const canCancel = !isTerminal(group);

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
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">
            {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Booked {formatWhen(group.created_at)}
          </p>
        </div>
        <GroupStatusBadge group={group} />
      </div>

      {/* The status sentence, and the all-or-nothing rule stated where it
          matters rather than buried in terms. */}
      <p className="mt-4 rounded-card border border-line bg-surface-sunken p-4 text-sm text-text">
        {GROUP_STATUS_MEANING[group.status]}
      </p>

      {group.units.length > 1 && !isTerminal(group) ? (
        <p className="mt-2 text-sm text-text-secondary">
          {held} of {group.units.length} visits have a professional held. They are booked
          together or not at all.
        </p>
      ) : null}

      {/* Server-published, never inferred from status. */}
      {recovery !== null ? (
        <p className="mt-3 text-sm font-medium text-text" data-testid="recovery-action">
          {recovery}
        </p>
      ) : null}

      {group.recovery_action === "REPLAN" ? (
        <div className="mt-3">
          <Link href="/cart" className={buttonStyles({ variant: "outline" })}>
            Choose a new arrangement
          </Link>
        </div>
      ) : null}

      {expiry && !expiry.isExpired && !isTerminal(group) ? (
        <p className="mt-3 text-sm text-text-secondary">
          <span aria-hidden data-numeric>
            {expiry.display}
          </span>
          <span className="sr-only">{expiry.announce}</span>
          <span> before this booking expires if we cannot fill every visit</span>
        </p>
      ) : null}

      {/* Freshness, stated rather than implied. A screen that silently stopped
          updating would look identical to one that is up to date. */}
      <p className="mt-3 text-xs text-text-secondary" aria-live="polite">
        {groupQuery.isFetching
          ? "Checking for updates…"
          : groupQuery.isError
            ? "We could not check for updates just now."
            : isTerminal(group)
              ? "This booking is finished, so it will not change again."
              : "Updating automatically. You can close this page — it keeps going without it."}
      </p>

      <ul className="mt-5 flex flex-col gap-3">
        {group.units.map((unit, index) => (
          <UnitCard key={unit.id} unit={unit} index={index} total={group.units.length} />
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => void groupQuery.refetch()} disabled={groupQuery.isFetching}>
          Refresh now
        </Button>
        {canCancel ? (
          <Button variant="ghost" onClick={() => setIsCancelOpen(true)}>
            Cancel this booking
          </Button>
        ) : null}
      </div>

      {cancelGroup.isError ? (
        <p className="mt-3 text-sm text-critical" role="alert">
          {describeCancelFailure(cancelGroup.error)}
        </p>
      ) : null}

      <p className="mt-4 text-xs text-text-secondary">
        Reference <span className="font-mono tabular-nums">{group.id}</span>
      </p>

      <CancelDialog
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
    </div>
  );
}

export { GROUP_STATUS_LABELS };
