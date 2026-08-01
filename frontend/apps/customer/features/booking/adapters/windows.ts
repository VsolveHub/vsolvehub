import type {
  ProposedWindow,
  ProposedWindowDay,
  ProposedWindows,
  WindowUnavailableReason,
} from "../contract-pending/types";

/**
 * Window responses become something a component can render.
 *
 * The view models below are the contract as far as `../view/` is concerned. When
 * the real endpoint is published, this file is rewritten and the components are
 * not.
 */

/**
 * Window times are formatted in the service area's timezone, not the browser's.
 *
 * A customer booking from an airport in another timezone must see the time the
 * professional will arrive at their home in Hyderabad. Formatting in the device
 * timezone would silently shift every window.
 *
 * M1 is Hyderabad-only, so this is a constant. When service areas span timezones
 * it belongs on the response.
 */
export const BOOKING_TIME_ZONE = "Asia/Kolkata";

export interface WindowView {
  id: string;
  /** "11:00 am – 12:00 pm" */
  label: string;
  /** Start time alone, for compact layouts. */
  startLabel: string;
  isAvailable: boolean;
  /** Why it cannot be booked. Null when it can. */
  unavailableLabel: string | null;
}

export interface WindowDayView {
  /** `YYYY-MM-DD`, used as the selection value. */
  date: string;
  /** "Today", "Tomorrow", or "Thu 6 Aug". */
  label: string;
  /** "30" — the numeral for a compact date strip. */
  dayOfMonth: string;
  hasAvailability: boolean;
  windows: WindowView[];
}

export interface WindowsView {
  days: WindowDayView[];
  /** Server-derived from the chosen task lines. Display only (ADR-008). */
  estimatedDurationMinutes: number;
  /** True when no day in the range has a bookable window. */
  isEmpty: boolean;
}

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: BOOKING_TIME_ZONE,
});

const weekdayFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: BOOKING_TIME_ZONE,
});

const dayNumberFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  timeZone: BOOKING_TIME_ZONE,
});

/** Lowercased so "11:00 AM" reads as "11:00 am", matching the rest of the UI. */
function formatTime(instant: string): string {
  return timeFormatter.format(new Date(instant)).toLowerCase();
}

const UNAVAILABLE_LABELS: Record<WindowUnavailableReason, string> = {
  NO_CAPACITY: "Fully booked",
  OUTSIDE_OPERATING_WINDOW: "Outside service hours",
  // The 120-minute Today lead time. Named concretely because "unavailable"
  // alone makes a customer retry the same window.
  TOO_SOON: "Too soon to book",
  PAST: "Passed",
};

export function toWindowView(window: ProposedWindow): WindowView {
  return {
    id: window.id,
    label: `${formatTime(window.starts_at)} – ${formatTime(window.ends_at)}`,
    startLabel: formatTime(window.starts_at),
    isAvailable: window.is_available,
    unavailableLabel: window.is_available
      ? null
      : (window.unavailable_reason && UNAVAILABLE_LABELS[window.unavailable_reason]) ??
        "Not available",
  };
}

/**
 * Relative day labels, computed against the server's clock.
 *
 * `serverNow` rather than `Date.now()` because a device with a wrong date would
 * otherwise label the wrong day "Today" — and the customer would book it.
 */
function dayLabel(date: string, serverNow: string): string {
  const todayKey = isoDateIn(new Date(serverNow));
  const tomorrowKey = isoDateIn(new Date(Date.parse(serverNow) + 86_400_000));

  if (date === todayKey) return "Today";
  if (date === tomorrowKey) return "Tomorrow";

  // Noon avoids the date flipping when the UTC instant and the IST calendar day
  // disagree at the boundary.
  return weekdayFormatter.format(new Date(`${date}T12:00:00Z`));
}

/** The calendar date at `instant`, in the booking timezone. */
function isoDateIn(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BOOKING_TIME_ZONE,
  }).format(instant);
}

function toDayView(day: ProposedWindowDay, serverNow: string): WindowDayView {
  return {
    date: day.date,
    label: dayLabel(day.date, serverNow),
    dayOfMonth: dayNumberFormatter.format(new Date(`${day.date}T12:00:00Z`)),
    hasAvailability: day.has_availability,
    windows: day.windows.map(toWindowView),
  };
}

export function toWindowsView(response: ProposedWindows): WindowsView {
  const days = response.days.map((day) => toDayView(day, response.server_now));

  return {
    days,
    estimatedDurationMinutes: response.estimated_duration_minutes,
    // Derived from bookable windows rather than from `has_availability` alone,
    // so a day flagged available but carrying only unavailable windows still
    // counts as empty. An empty result is a real answer and renders an empty
    // state — never conflated with the endpoint being unreachable, which throws.
    isEmpty: days.every((day) => day.windows.every((window) => !window.isAvailable)),
  };
}
