// Ported from frontend/apps/customer/features/engagement/model/calendar.ts
/**
 * A calendar file for a confirmed crew booking.
 *
 * ## Why the events are all-day
 *
 * Nothing published carries a shift start time. The frozen rate terms carry a
 * shift *length* — `standard_day_hours` — and the engagement's stages carry a
 * date, and at no point on this path was the Customer asked what time the crew
 * should arrive. An event at 9:00 am would be an appointment nobody agreed to,
 * sitting in somebody's calendar looking like a commitment.
 *
 * So each shift-day is a `VALUE=DATE` event: the right day, no claimed hour.
 *
 * ## Generated here rather than fetched
 *
 * Everything an `.ics` needs is already on screen. A server round trip would add
 * an endpoint, an authorisation question and a failure mode for a file the
 * browser can assemble from data it is already rendering.
 */

export interface CalendarDay {
  /** `YYYY-MM-DD`, from the stage's own `scheduled_on`. */
  date: string;
  /** The stage's label — "Day 1". */
  label: string;
}

export interface CrewCalendarInput {
  service: string;
  /** The supervisor, when the roster names one. */
  crewName: string | null;
  days: readonly CalendarDay[];
  /** Where the booking lives, so the event links back. */
  url?: string;
}

/** `YYYYMMDD`, the form `VALUE=DATE` wants. */
function toStamp(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

/** The day after, because `DTEND` on an all-day event is exclusive. */
function nextDayStamp(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1);
  const nextMonth = `${date.getMonth() + 1}`.padStart(2, "0");
  const nextDay = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}${nextMonth}${nextDay}`;
}

/**
 * Escapes a value for iCalendar text.
 *
 * Commas, semicolons and backslashes are field separators in the format, so an
 * unescaped service name containing one silently truncates the summary or
 * corrupts the event. Newlines become the literal `\n` the spec defines.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * The whole booking as one calendar file.
 *
 * `stamp` is passed in rather than read from the clock, so the output is a pure
 * function of its input — which is what makes it testable, and what keeps a
 * "download twice, get two different files" surprise out of it.
 */
export function buildCrewCalendar(
  input: CrewCalendarInput,
  stamp: string,
): string {
  const summary = escapeText(
    input.crewName === null ? input.service : `${input.service} — ${input.crewName}`,
  );

  const events = input.days.flatMap((day) => [
    "BEGIN:VEVENT",
    // Stable per booking-day, so re-importing updates the event rather than
    // creating a second one beside it.
    `UID:${toStamp(day.date)}-${escapeText(day.label)}@vsolvehub.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${toStamp(day.date)}`,
    `DTEND;VALUE=DATE:${nextDayStamp(day.date)}`,
    `SUMMARY:${summary} (${escapeText(day.label)})`,
    ...(input.url === undefined ? [] : [`URL:${escapeText(input.url)}`]),
    "END:VEVENT",
  ]);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//V Solve Hub//Crew booking//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
    // The spec requires CRLF line endings, and enough calendar clients enforce
    // it that LF-separated files fail to import on iOS without an error.
  ].join("\r\n");
}

/** `YYYYMMDDTHHMMSSZ`, the `DTSTAMP` form. */
export function calendarStamp(now: Date): string {
  return `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}
