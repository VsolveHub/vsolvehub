import type { Schemas } from "@vsolve/api-client";

/**
 * Weekly working periods, as the Partner edits them.
 *
 * ADR-010: availability is *explicit*. Nothing here defaults a Partner to
 * available — a new week starts empty, and every hour on the calendar got there
 * because someone published it. That is the whole point of the model, and it is
 * why there is no "typical week" preset to click.
 *
 * The editor works on a draft and saves the whole schedule at once, matching the
 * contract's whole-schedule PUT. Rules must be consistent with each other, and a
 * per-row save could leave two overlapping periods committed.
 */

type Rule = Schemas["PartnerAvailabilityRule"];
type RuleInput = Schemas["PartnerAvailabilityRuleInputRequest"];

/** Monday is 0 and Sunday is 6, matching the contract. */
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export interface DraftPeriod {
  /** Local-only id so React can key rows before the server assigns one. */
  key: string;
  serviceAreaId: string;
  weekday: number;
  /** `HH:MM`, as the time input produces. */
  startsAt: string;
  endsAt: string;
  /**
   * True when the period runs past midnight.
   *
   * Not inferred from `endsAt <= startsAt`. "22:00–06:00" is unambiguous, but
   * "09:00–09:00" is not: it could be a zero-length mistake or a full 24 hours.
   * Making the Partner say which prevents the editor from silently choosing.
   */
  endsNextDay: boolean;
}

let counter = 0;
function nextKey(): string {
  counter += 1;
  return `period-${counter}`;
}

export function toDraft(rules: readonly Rule[]): DraftPeriod[] {
  return rules
    .filter((rule) => rule.is_active)
    .map((rule) => ({
      key: nextKey(),
      serviceAreaId: rule.service_area_id,
      weekday: rule.weekday,
      startsAt: rule.starts_at.slice(0, 5),
      endsAt: rule.ends_at.slice(0, 5),
      endsNextDay: rule.ends_next_day,
    }));
}

export function newPeriod(serviceAreaId: string, weekday: number): DraftPeriod {
  return {
    key: nextKey(),
    serviceAreaId,
    weekday,
    // A sensible working day, but the Partner still has to save it. Prefilling
    // the *form* is not the same as defaulting them to available.
    startsAt: "09:00",
    endsAt: "18:00",
    endsNextDay: false,
  };
}

export function toRuleInputs(periods: readonly DraftPeriod[]): RuleInput[] {
  return periods.map((period) => ({
    service_area_id: period.serviceAreaId,
    weekday: period.weekday,
    starts_at: `${period.startsAt}:00`,
    ends_at: `${period.endsAt}:00`,
    ends_next_day: period.endsNextDay,
  }));
}

export type PeriodProblem =
  | "ZERO_LENGTH"
  | "ENDS_BEFORE_START"
  | "OVERLAPS_ANOTHER";

/** Minutes since midnight, for comparison only. */
function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}

/** The interval a period occupies, in minutes from the start of its weekday. */
function interval(period: DraftPeriod): [number, number] {
  const start = minutes(period.startsAt);
  const end = minutes(period.endsAt) + (period.endsNextDay ? 24 * 60 : 0);
  return [start, end];
}

/**
 * Why a period cannot be saved, or null when it can.
 *
 * Overlap is checked client-side as well as server-side, not to replace the
 * database constraint but because the Partner is the only one who can say which
 * of two overlapping periods they meant.
 */
export function periodProblem(
  period: DraftPeriod,
  all: readonly DraftPeriod[],
): PeriodProblem | null {
  const [start, end] = interval(period);

  if (end === start) return "ZERO_LENGTH";
  if (end < start) return "ENDS_BEFORE_START";

  const overlaps = all.some((other) => {
    if (other.key === period.key) return false;
    if (other.weekday !== period.weekday) return false;
    if (other.serviceAreaId !== period.serviceAreaId) return false;
    const [otherStart, otherEnd] = interval(other);
    // Touching endpoints are fine: 09:00–13:00 and 13:00–17:00 are two shifts,
    // not a conflict.
    return start < otherEnd && otherStart < end;
  });

  return overlaps ? "OVERLAPS_ANOTHER" : null;
}

export function scheduleProblems(
  periods: readonly DraftPeriod[],
): Map<string, PeriodProblem> {
  const problems = new Map<string, PeriodProblem>();
  for (const period of periods) {
    const problem = periodProblem(period, periods);
    if (problem !== null) problems.set(period.key, problem);
  }
  return problems;
}

/** Total published hours per week, for the summary line. */
export function weeklyHours(periods: readonly DraftPeriod[]): number {
  const total = periods.reduce((sum, period) => {
    const [start, end] = interval(period);
    return sum + Math.max(0, end - start);
  }, 0);
  return Math.round((total / 60) * 10) / 10;
}
