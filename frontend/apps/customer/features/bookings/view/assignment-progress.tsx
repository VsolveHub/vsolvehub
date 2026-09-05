"use client";

import { buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import type { BookingGroup } from "../queries";
import { GROUP_STATUS_MEANING, RECOVERY_LABELS, heldUnitCount } from "./group-status";

export interface AssignmentProgressProps {
  group: BookingGroup;
}

export function AssignmentProgress({ group }: AssignmentProgressProps) {
  const recovery = RECOVERY_LABELS[group.recovery_action];
  const held = heldUnitCount(group);
  const total = group.units.length;

  return (
    <section aria-labelledby="assignment-heading" className="space-y-3">
      <h2 id="assignment-heading" className="sr-only">
        Progress
      </h2>

      {/* Clean Status Box */}
      <div
        className="rounded-xl border border-line bg-surface-sunken p-4 text-sm text-text"
        aria-live="polite"
      >
        <p className="font-medium text-text">
          {GROUP_STATUS_MEANING[group.status]}
        </p>

        {total > 1 ? (
          <p className="mt-2 text-xs text-text-secondary">
            {held} of {total} visits have a professional held. They are booked together or not at all.
          </p>
        ) : null}
      </div>

      {/* Server-published recovery instruction */}
      {recovery !== null ? (
        <p className="text-sm font-medium text-text" data-testid="recovery-action">
          {recovery}
        </p>
      ) : null}

      {group.recovery_action === "REPLAN" ? (
        <div>
          <Link href="/cart" className={buttonStyles({ variant: "outline" })}>
            Choose a new arrangement
          </Link>
        </div>
      ) : null}

      {/* When payment is required in standalone progress view */}
      {group.recovery_action === "PAYMENT_REQUIRED" && group.checkout_id !== null ? (
        <div className="lg:hidden">
          <Link
            href={`/bookings/${group.id}/pay`}
            className={buttonStyles({
              className: "w-full justify-center text-sm font-bold bg-orange-600 hover:bg-orange-700",
            })}
          >
            Pay now
          </Link>
        </div>
      ) : null}
    </section>
  );
}
