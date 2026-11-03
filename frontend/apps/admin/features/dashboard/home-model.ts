/**
 * Pure helpers for the Home screen: the period an operator compares, and how a figure moved
 * against the period before it. Kept apart from the views so they are tested without a server.
 */

export type HomePeriod = "today" | "7d" | "30d";

export const PERIOD_LABELS: Record<HomePeriod, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

/** What the comparison is against, in the operator's words. */
export const PREVIOUS_LABELS: Record<HomePeriod, string> = {
  today: "yesterday",
  "7d": "the 7 days before",
  "30d": "the 30 days before",
};

const PERIOD_DAYS: Record<HomePeriod, number> = { today: 1, "7d": 7, "30d": 30 };

export interface DateRange {
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, `YYYY-MM-DD`. */
  end: string;
}

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The selected period ending today, and the same length just before it. */
export function periodRanges(period: HomePeriod, today: Date): { current: DateRange; previous: DateRange } {
  const days = PERIOD_DAYS[period];
  const currentStart = addDays(today, -(days - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  return {
    current: { start: isoDay(currentStart), end: isoDay(today) },
    previous: { start: isoDay(previousStart), end: isoDay(previousEnd) },
  };
}

export interface Change {
  direction: "up" | "down" | "flat";
  /** Whole percent, or null when there is nothing to compare against. */
  percent: number | null;
}

/** How `current` moved against `previous`. From zero there is no percentage to quote. */
export function changeBetween(current: number, previous: number): Change {
  if (current === previous) return { direction: "flat", percent: 0 };
  const direction = current > previous ? "up" : "down";
  if (previous === 0) return { direction, percent: null };
  return { direction, percent: Math.round((Math.abs(current - previous) / previous) * 100) };
}

/** "↑ 12% vs yesterday", "↑ vs none yesterday" when the base was zero, "Same as yesterday". */
export function describeChange(change: Change, against: string): string {
  if (change.direction === "flat") return `Same as ${against}`;
  const arrow = change.direction === "up" ? "↑" : "↓";
  if (change.percent === null) return `${arrow} vs none ${against}`;
  return `${arrow} ${change.percent}% vs ${against}`;
}

/** Sum of the per-category booking counts the categories dashboard returns. */
export function totalBookings(categories: Record<string, { bookings?: number }> | undefined): number {
  return Object.values(categories ?? {}).reduce((sum, row) => sum + (row.bookings ?? 0), 0);
}
