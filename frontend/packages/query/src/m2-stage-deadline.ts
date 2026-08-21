import type { Schemas } from "@vsolve/api-client";

type EngagementStage = Schemas["EngagementStage"];

export type StageDeadlineState = "remaining" | "due_today" | "extra" | "complete";

export interface StageDeadline {
  readonly state: StageDeadlineState;
  readonly label: string;
  readonly days: number;
  readonly startsOn: string | null;
  readonly dueOn: string;
  readonly durationDays: number | null;
}

const DAY_MS = 86_400_000;

function dateNumber(value: string): number | null {
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function dayWord(days: number): string {
  return days === 1 ? "day" : "days";
}

/** Calendar-day countdown against the deadline frozen into the agreement. */
export function stageDeadline(
  stage: EngagementStage,
  serverNow: string,
): StageDeadline | null {
  if (stage.scheduled_on === null) return null;
  const due = dateNumber(stage.scheduled_on);
  const today = dateNumber(serverNow);
  if (due === null || today === null) return null;

  const delta = Math.round((due - today) / DAY_MS);
  const complete =
    stage.status === "APPROVED" ||
    stage.status === "RELEASED" ||
    stage.status === "CANCELLED";
  if (complete) {
    return {
      state: "complete",
      label: stage.status === "CANCELLED" ? "Stage closed" : "Stage completed",
      days: 0,
      startsOn: stage.starts_on,
      dueOn: stage.scheduled_on,
      durationDays: stage.duration_days,
    };
  }
  if (delta > 0) {
    return {
      state: "remaining",
      label: `${delta} ${dayWord(delta)} left`,
      days: delta,
      startsOn: stage.starts_on,
      dueOn: stage.scheduled_on,
      durationDays: stage.duration_days,
    };
  }
  if (delta === 0) {
    return {
      state: "due_today",
      label: "Due today",
      days: 0,
      startsOn: stage.starts_on,
      dueOn: stage.scheduled_on,
      durationDays: stage.duration_days,
    };
  }
  const extra = Math.abs(delta);
  return {
    state: "extra",
    label: `${extra} extra ${dayWord(extra)}`,
    days: extra,
    startsOn: stage.starts_on,
    dueOn: stage.scheduled_on,
    durationDays: stage.duration_days,
  };
}
