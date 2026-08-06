"use client";

import { buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { isTerminal, type BookingGroup } from "../queries";
import { GROUP_STATUS_MEANING, RECOVERY_LABELS, heldUnitCount } from "./group-status";

/**
 * What is happening to a booking between Confirm and Pay.
 *
 * Django's lifecycle is assign-then-pay: confirming creates the group and sends
 * offers, and payment opens only once **every** Partner has committed. The wait
 * in between is a real step of the flow, and this is its headline — how far the
 * search has got, what the platform is asking for next, and the one control that
 * answers it.
 *
 * The per-visit detail belongs to `group-detail`'s own unit list, which links
 * each visit to its live tracking; duplicating it here would give the same
 * booking two lists that could disagree.
 *
 * ## Everything is read, nothing is inferred
 *
 * The sentence comes from `status` and the payment control from the published
 * `recovery_action`. `PAYMENT_PENDING` looks like it obviously implies "show the
 * pay button", and that inference is exactly what would offer a control Django
 * refuses the first time the two rules drift — the same reason
 * `group-status.tsx` refuses to derive `recovery_action` from `status`.
 *
 * ## Progress is never reported as partial success
 *
 * Under `ALL_OR_NOTHING` a group with two of three professionals held has booked
 * nothing. The count is phrased against the whole and the all-or-nothing rule is
 * stated beside it, because a customer who reads "2 of 3 confirmed" will plan
 * their day around visits that may never happen.
 */

export interface AssignmentProgressProps {
  group: BookingGroup;
}

export function AssignmentProgress({ group }: AssignmentProgressProps) {
  const recovery = RECOVERY_LABELS[group.recovery_action];
  const held = heldUnitCount(group);
  const isWaiting = !isTerminal(group) && group.order_id === null;

  return (
    <section aria-labelledby="assignment-heading">
      <h2 id="assignment-heading" className="sr-only">
        Progress
      </h2>

      {/* The server's own sentence for the state it is in. */}
      <p
        className="rounded-card border border-line bg-surface-sunken p-4 text-sm text-text"
        aria-live="polite"
      >
        {GROUP_STATUS_MEANING[group.status]}
      </p>

      {group.units.length > 1 && isWaiting ? (
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

      {/* The server said payment is due, so the server's own instruction gets a
          control. Gated on `recovery_action` and on the checkout the group
          publishes — not on the status string, and never on a checkout id this
          client remembered from the tab that confirmed. */}
      {group.recovery_action === "PAYMENT_REQUIRED" && group.checkout_id !== null ? (
        <div className="mt-3">
          <Link href={`/bookings/${group.id}/pay`} className={buttonStyles({})}>
            Pay now
          </Link>
        </div>
      ) : null}
    </section>
  );
}
