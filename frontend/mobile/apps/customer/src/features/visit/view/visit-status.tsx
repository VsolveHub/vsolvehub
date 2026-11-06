// Ported from frontend/apps/customer/features/visit/view/visit-status.tsx
import { Badge } from "@vsolve/mobile-ui";

import type { VisitStatus } from "../queries";

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
  RECOVERY_REQUIRED: "Assigning a new professional",
  CANCELLED: "Cancelled",
};

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
    "Your professional had to step back. We are assigning someone else now — if we cannot, " +
    "this visit is cancelled and refunded in full automatically.",
  CANCELLED: "This visit was cancelled.",
};

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const VISIT_STATUS_TONES: Record<VisitStatus, BadgeTone> = {
  CONFIRMED: "info",
  EN_ROUTE: "info",
  ARRIVED: "info",
  IN_PROGRESS: "info",
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

