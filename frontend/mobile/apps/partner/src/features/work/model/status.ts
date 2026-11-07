// Ported from frontend/apps/partner/features/work/model/status.ts
import type { VisitStatus } from "../queries";

/**
 * Plain wording for every booking status, and the colour that carries it.
 *
 * One table, used by the job list and the job page alike. The detail screen used
 * to render `status.replaceAll("_", " ").toLowerCase()`, which put raw domain
 * vocabulary — "completion submitted", "recovery required" — in front of a
 * reader who may not read comfortably, and drifted from the list's own wording
 * for the same state.
 *
 * A `Record` on purpose: a status added to the contract is a `typecheck` failure
 * rather than a pill that renders `undefined`.
 */

export type StatusTone = "go" | "wait" | "done" | "stop";

export const STATUS_COPY: Record<VisitStatus, { label: string; tone: StatusTone }> = {
  CONFIRMED: { label: "Booked", tone: "wait" },
  EN_ROUTE: { label: "On the way", tone: "go" },
  ARRIVED: { label: "Arrived", tone: "go" },
  IN_PROGRESS: { label: "Working", tone: "go" },
  COMPLETION_SUBMITTED: { label: "Waiting for customer", tone: "wait" },
  COMPLETED: { label: "Done", tone: "done" },
  PARTIALLY_COMPLETED: { label: "Part done", tone: "done" },
  DISPUTED: { label: "Customer raised a problem", tone: "stop" },
  RECOVERY_REQUIRED: { label: "Needs help", tone: "stop" },
  ABORTED: { label: "Stopped", tone: "stop" },
  CANCELLED: { label: "Cancelled", tone: "stop" },
};

export const TONE_STYLES: Record<StatusTone, string> = {
  go: "border-info-line bg-info-surface text-info-text",
  wait: "border-warning-line bg-warning-surface text-warning-text",
  done: "border-success-line bg-success-surface text-success-text",
  stop: "border-critical-200 bg-critical-50 text-critical",
};
