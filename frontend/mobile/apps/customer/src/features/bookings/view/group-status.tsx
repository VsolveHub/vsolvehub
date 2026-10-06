// Ported from frontend/apps/customer/features/bookings/view/group-status.tsx
import type { Schemas } from "@vsolve/api-client";
import { Badge } from "@vsolve/mobile-ui";

import type { BookingGroup, FulfilmentUnit, GroupStatus, RecoveryAction } from "../queries";

export const GROUP_STATUS_LABELS: Record<GroupStatus, string> = {
  CONFIRMED: "Confirmed",
  MATCHING: "Finding professionals",
  PARTIALLY_HELD: "Still finding professionals",
  ALL_UNITS_HELD: "All professionals held",
  PAYMENT_PENDING: "Ready for payment",
  BOOKED: "Booked",
  COMPLETED: "Completed",
  REPLAN_REQUIRED: "Needs a new time",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  FAILED: "Could not be completed",
};

export const GROUP_STATUS_MEANING: Record<GroupStatus, string> = {
  CONFIRMED: "We have your booking and are about to start looking.",
  MATCHING: "We are offering your visits to professionals now.",
  PARTIALLY_HELD:
    "Some visits have someone held and others do not yet. Everything in this booking goes ahead together, so nothing is confirmed until every visit has a professional.",
  ALL_UNITS_HELD: "Every visit has a professional held. Nothing has been charged yet.",
  PAYMENT_PENDING: "Every visit has a professional. Payment is the last step.",
  BOOKED: "Everything is confirmed.",
  COMPLETED: "Every visit in this booking is finished.",
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
  COMPLETED: "success",
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
  RECOVERY_REQUIRED: "Assigning a new professional",
  CANCELLED: "Cancelled",
  FAILED: "No professional found",
  COMPLETED: "Completed",
  PARTIALLY_COMPLETED: "Partly done",
  DISPUTED: "Being looked into",
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
  RECOVERY_REQUIRED: "warning",
  CANCELLED: "neutral",
  FAILED: "danger",
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "warning",
  DISPUTED: "warning",
};

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

export function heldUnitCount(group: BookingGroup): number {
  return group.units.filter((unit) => unit.status === "HELD" || unit.status === "BOOKED").length;
}
