"use client";

import { Badge } from "@vsolve/ui";

import type { VisitStatus } from "../queries";

/**
 * Customer-facing wording for one visit's lifecycle.
 *
 * ## The two labels that have to be actively defended
 *
 * **`RECOVERY_REQUIRED` does not say "cancelled".** The Partner has stepped
 * back and the platform is finding a replacement — the visit is still live, and
 * telling a customer it is cancelled would have them rebook a job that is
 * already being recovered.
 *
 * **`COMPLETION_SUBMITTED` does not say "completed".** The Partner has reported
 * the work; the customer has not agreed yet. Collapsing the two would be the
 * platform declaring on the customer's behalf that they are satisfied, which is
 * exactly the state the confirm/dispute pair exists to make explicit.
 *
 * ## Record, not partial
 *
 * `Record<VisitStatus, …>` on purpose: a status added to the contract becomes a
 * `typecheck` failure rather than a badge that renders `undefined` in front of
 * somebody trying to work out what happened to their booking.
 */

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  CONFIRMED: "Booked",
  EN_ROUTE: "On the way",
  ARRIVED: "Arrived",
  IN_PROGRESS: "Work in progress",
  COMPLETION_SUBMITTED: "Waiting for your confirmation",
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Partly completed",
  DISPUTED: "Reported — under review",
  ABORTED: "Stopped",
  RECOVERY_REQUIRED: "Finding a replacement professional",
  CANCELLED: "Cancelled",
};

/**
 * One line of plain explanation under the badge.
 *
 * A status word alone leaves the customer to guess what happens next; several of
 * these states are ones nobody has seen before and none of them are self-evident.
 */
export const VISIT_STATUS_DESCRIPTIONS: Record<VisitStatus, string> = {
  CONFIRMED: "Your professional is assigned and will set off closer to the time.",
  EN_ROUTE: "Your professional is travelling to you.",
  ARRIVED: "Your professional is at your address. Share your start code to begin.",
  IN_PROGRESS: "Work has started.",
  COMPLETION_SUBMITTED:
    "Your professional has reported what was done. Confirm it, or tell us if something is wrong.",
  COMPLETED: "This visit is finished and settled.",
  PARTIALLY_COMPLETED: "Some of the work was not completed. You have been refunded for that part.",
  DISPUTED: "We are looking into what you reported. Payment to the professional is on hold.",
  ABORTED: "Work stopped before it was finished. We are settling what was done.",
  RECOVERY_REQUIRED:
    "Your professional had to step back. We are finding a replacement — you can also cancel.",
  CANCELLED: "This visit was cancelled.",
};

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const VISIT_STATUS_TONES: Record<VisitStatus, BadgeTone> = {
  CONFIRMED: "info",
  EN_ROUTE: "info",
  ARRIVED: "info",
  IN_PROGRESS: "info",
  // Needs the customer to act, so it reads as attention rather than progress.
  COMPLETION_SUBMITTED: "warning",
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "warning",
  DISPUTED: "warning",
  ABORTED: "warning",
  RECOVERY_REQUIRED: "warning",
  CANCELLED: "neutral",
};

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return <Badge tone={VISIT_STATUS_TONES[status]}>{VISIT_STATUS_LABELS[status]}</Badge>;
}
