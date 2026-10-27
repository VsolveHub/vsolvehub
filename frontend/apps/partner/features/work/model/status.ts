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

/** `labelKey` is a catalogue key; resolve with `t` at render time. */
export const STATUS_COPY: Record<VisitStatus, { labelKey: string; tone: StatusTone }> = {
  CONFIRMED: { labelKey: "work.visitStatus.confirmed", tone: "wait" },
  EN_ROUTE: { labelKey: "work.visitStatus.enRoute", tone: "go" },
  ARRIVED: { labelKey: "work.visitStatus.arrived", tone: "go" },
  IN_PROGRESS: { labelKey: "work.visitStatus.inProgress", tone: "go" },
  COMPLETION_SUBMITTED: { labelKey: "work.visitStatus.completionSubmitted", tone: "wait" },
  COMPLETED: { labelKey: "work.visitStatus.completed", tone: "done" },
  PARTIALLY_COMPLETED: { labelKey: "work.visitStatus.partiallyCompleted", tone: "done" },
  DISPUTED: { labelKey: "work.visitStatus.disputed", tone: "stop" },
  RECOVERY_REQUIRED: { labelKey: "work.visitStatus.recoveryRequired", tone: "stop" },
  ABORTED: { labelKey: "work.visitStatus.aborted", tone: "stop" },
  CANCELLED: { labelKey: "work.visitStatus.cancelled", tone: "stop" },
};

export const TONE_STYLES: Record<StatusTone, string> = {
  go: "border-info-line bg-info-surface text-info-text",
  wait: "border-warning-line bg-warning-surface text-warning-text",
  done: "border-success-line bg-success-surface text-success-text",
  stop: "border-critical-200 bg-critical-50 text-critical",
};
