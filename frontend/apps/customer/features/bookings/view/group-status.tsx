"use client";

import type { Schemas } from "@vsolve/api-client";
import { Badge } from "@vsolve/ui";

import type { BookingGroup, FulfilmentUnit, GroupStatus, RecoveryAction } from "../queries";

/**
 * Customer-facing wording for group and unit state.
 *
 * ## `PARTIALLY_HELD` is pending, never partial success
 *
 * This is the one label on the screen that has to be actively defended. Under
 * `ALL_OR_NOTHING` a group with two of three professionals held has booked
 * *nothing*, and a customer who reads "2 of 3 confirmed" will plan their day
 * around two visits that may never happen. The wording below says the search is
 * still running, because that is what is true.
 *
 * ## Nothing here is derived from anything else
 *
 * `recovery_action` is a published field and is rendered as sent. Inferring it
 * from `status` — `REPLAN_REQUIRED` obviously means replan — would be a second
 * implementation of a server rule, and the first time the two disagreed the
 * customer would be offered an action Django refuses.
 */

export const GROUP_STATUS_LABELS: Record<GroupStatus, string> = {
  CONFIRMED: "Confirmed",
  MATCHING: "Finding professionals",
  PARTIALLY_HELD: "Still finding professionals",
  ALL_UNITS_HELD: "All professionals held",
  PAYMENT_PENDING: "Ready for payment",
  BOOKED: "Booked",
  REPLAN_REQUIRED: "Needs replanning",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Could not be completed",
};

/** What the status means, in the customer's terms rather than the domain's. */
export const GROUP_STATUS_MEANING: Record<GroupStatus, string> = {
  CONFIRMED: "We have your booking and are about to start looking.",
  MATCHING: "We are offering your visits to professionals now.",
  // The defended one.
  PARTIALLY_HELD:
    "Some visits have someone held and others do not yet. Everything in this booking goes ahead together, so nothing is confirmed until every visit has a professional.",
  ALL_UNITS_HELD: "Every visit has a professional held. Nothing has been charged yet.",
  PAYMENT_PENDING: "Every visit has a professional. Payment is the last step.",
  BOOKED: "Everything is confirmed.",
  REPLAN_REQUIRED:
    "We could not fill every visit, so nothing was booked and any holds have been released. Choosing a new arrangement starts a fresh search.",
  CANCELLED: "This booking was cancelled. Nothing has been charged.",
  EXPIRED: "This booking was not confirmed in time. Nothing has been charged.",
  FAILED: "We could not complete this booking. Nothing has been charged.",
};

const GROUP_TONES: Record<GroupStatus, "neutral" | "success" | "warning" | "danger"> = {
  CONFIRMED: "neutral",
  MATCHING: "neutral",
  PARTIALLY_HELD: "neutral",
  ALL_UNITS_HELD: "success",
  PAYMENT_PENDING: "warning",
  BOOKED: "success",
  REPLAN_REQUIRED: "warning",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  FAILED: "danger",
};

export const UNIT_STATUS_LABELS: Record<Schemas["FulfilmentUnitStatusEnum"], string> = {
  PLANNED: "Not started yet",
  MATCHING: "Finding a professional",
  HELD: "Professional held",
  PAYMENT_PENDING: "Awaiting payment",
  BOOKED: "Booked",
  CANCELLED: "Cancelled",
  FAILED: "No professional found",
  COMPLETED: "Completed",
};

const UNIT_TONES: Record<
  Schemas["FulfilmentUnitStatusEnum"],
  "neutral" | "success" | "warning" | "danger"
> = {
  PLANNED: "neutral",
  MATCHING: "neutral",
  HELD: "success",
  PAYMENT_PENDING: "warning",
  BOOKED: "success",
  CANCELLED: "neutral",
  FAILED: "danger",
  COMPLETED: "success",
};

/**
 * What the server says the customer can do next.
 *
 * `NONE` is genuinely "nothing to do", not "we do not know" — so it renders no
 * call to action rather than a disabled one.
 */
export const RECOVERY_LABELS: Record<RecoveryAction, string | null> = {
  WAIT: "Nothing to do — we will keep going and let you know.",
  PAYMENT_REQUIRED: "Payment is needed to confirm this booking.",
  REPLAN: "Choose a new arrangement to try again.",
  NONE: null,
};

export function GroupStatusBadge({ group }: { group: BookingGroup }) {
  return <Badge tone={GROUP_TONES[group.status]}>{GROUP_STATUS_LABELS[group.status]}</Badge>;
}

export function UnitStatusBadge({ unit }: { unit: FulfilmentUnit }) {
  return <Badge tone={UNIT_TONES[unit.status]}>{UNIT_STATUS_LABELS[unit.status]}</Badge>;
}

/**
 * How many units have a professional held, stated without implying success.
 *
 * The count is genuinely useful — a customer watching a three-visit booking
 * wants to know it is moving — so it is shown, but always beside the
 * all-or-nothing sentence and never as a progress claim on its own.
 */
export function heldUnitCount(group: BookingGroup): number {
  return group.units.filter((unit) => unit.status === "HELD" || unit.status === "BOOKED").length;
}
