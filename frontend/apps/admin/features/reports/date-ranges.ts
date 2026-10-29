/**
 * Quick date ranges for reports, in the admin's local calendar.
 *
 * A report's dates are whole days (`date_end` includes all of that day on the server), so each
 * range is a pair of ISO dates like `2026-10-01` … `2026-10-29`.
 */

export type QuickRange = "today" | "yesterday" | "last_7_days" | "this_month" | "last_month" | "all";

export const QUICK_RANGES: { key: QuickRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7_days", label: "Last 7 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "all", label: "All time" },
];

/** The range a report opens on. */
export const DEFAULT_RANGE: QuickRange = "this_month";

export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** `{date_start, date_end}` for a quick range; both empty for all time. */
export function rangeDates(range: QuickRange, today: Date = new Date()): { date_start: string; date_end: string } {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (range) {
    case "today":
      return { date_start: isoDay(day), date_end: isoDay(day) };
    case "yesterday": {
      const yesterday = addDays(day, -1);
      return { date_start: isoDay(yesterday), date_end: isoDay(yesterday) };
    }
    case "last_7_days":
      return { date_start: isoDay(addDays(day, -6)), date_end: isoDay(day) };
    case "this_month":
      return { date_start: isoDay(new Date(day.getFullYear(), day.getMonth(), 1)), date_end: isoDay(day) };
    case "last_month":
      return {
        date_start: isoDay(new Date(day.getFullYear(), day.getMonth() - 1, 1)),
        date_end: isoDay(new Date(day.getFullYear(), day.getMonth(), 0)),
      };
    case "all":
      return { date_start: "", date_end: "" };
  }
}

/** Which quick range these dates are, or `null` for a custom pair. */
export function matchingRange(dateStart: string, dateEnd: string, today: Date = new Date()): QuickRange | null {
  for (const { key } of QUICK_RANGES) {
    const dates = rangeDates(key, today);
    if (dates.date_start === dateStart && dates.date_end === dateEnd) return key;
  }
  return null;
}
