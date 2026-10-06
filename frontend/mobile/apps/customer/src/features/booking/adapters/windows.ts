// Ported from frontend/apps/customer/features/booking/adapters/windows.ts
import type { Schemas } from "@vsolve/api-client";

/**
 * Window responses become something a component can render.
 *
 * The view models below are the contract as far as `../view/` is concerned, and
 * that boundary paid off: contract 1.6.0 published the real operation, this file
 * was repointed at the generated types, and no component changed.
 *
 * Every window `id` is opaque and server-signed. The frontend never composes one
 * from a date and a time — that is how a UI offers a slot the backend never
 * published, and it is why the id is a string here rather than a parsed value.
 */

type PublishedWindow = Schemas["BookingWindow"];
type PublishedWindowDay = Schemas["BookingWindowDay"];
type PublishedWindows = Schemas["BookingWindows"];
type WindowUnavailableReason = NonNullable<Schemas["UnavailableReasonEnum"]>;

/**
 * @deprecated Prefer the `timezone` field on `BookingWindows`. M1 was
 * Hyderabad-only; the server now owns the service-area zone so labels cannot
 * silently shift when an area moves. Kept as a fallback for callers that have
 * no response yet (`adapters/index.ts` re-exports it).
 */
export const BOOKING_TIME_ZONE = "Asia/Kolkata";

export interface WindowView {
  id: string;
  /**
   * The server's own `starts_at` instant, carried through untouched.
   *
   * This is what the group flow sends as `preferred_start`, so it is passed on
   * exactly as received rather than reformatted and reparsed. The client never
   * composes an instant: every start time it can request is one the server
   * published for this cart and address.
   */
  startsAt: string;
  /** "11:00 am – 12:00 pm" */
  label: string;
  /** Start time alone, for compact layouts. */
  startLabel: string;
  isAvailable: boolean;
  /** Why it cannot be booked. Null when it can. */
  unavailableLabel: string | null;
  /**
   * "about 40 min" — the job itself, not the arrival window.
   *
   * The window label already states the arrival window's own span (e.g.
   * "11:00 am – 12:00 pm"); a customer choosing between windows also needs to
   * know how long the professional will actually be there once they arrive.
   */
  durationLabel: string;
  /**
   * "Only 1 pro left" when exactly one professional could still take this
   * window. Null otherwise — for an available window with room to spare,
   * naming the exact count would read as a manufactured sense of urgency
   * rather than information the customer can act on.
   */
  scarcityLabel: string | null;
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
  /**
   * The server is still settling capacity, so what is shown may change.
   *
   * Surfaced rather than hidden: a customer told a window is free and then
   * refused it at checkout has been misled, and the honest version is to say
   * the answer is provisional while it is.
   */
  isPreliminary: boolean;
}

interface ZoneFormatters {
  time: Intl.DateTimeFormat;
  weekday: Intl.DateTimeFormat;
  dayNumber: Intl.DateTimeFormat;
  isoDate: Intl.DateTimeFormat;
}

function formattersFor(timeZone: string): ZoneFormatters {
  return {
    time: new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }),
    weekday: new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }),
    dayNumber: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      timeZone,
    }),
    isoDate: new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    }),
  };
}

/** Lowercased so "11:00 AM" reads as "11:00 am", matching the rest of the UI. */
function formatTime(instant: string, formatters: ZoneFormatters): string {
  return formatters.time.format(new Date(instant)).toLowerCase();
}

/** Below this, naming the exact headcount is worth surfacing to the customer. */
const SOLE_REMAINING_PARTNER_CAPACITY = 1;

const UNAVAILABLE_LABELS: Record<WindowUnavailableReason, string> = {
  // Covers both "every Partner is already booked" and "nobody works this
  // slot at all" (spec 2026-08-07-work-based-slot-booking-design.md §5) — the
  // grid cannot tell the customer apart from here, and both read the same:
  // there is nobody who can take this window.
  NO_CAPACITY: "No pros available",
  OUTSIDE_OPERATING_WINDOW: "Outside service hours",
  // Reachability (or the flat today lead-time fallback). Named concretely
  // because "unavailable" alone makes a customer retry the same window.
  TOO_SOON: "Too soon to book",
  PAST: "Passed",
};

export function toWindowView(
  window: PublishedWindow,
  estimatedDurationMinutes = 0,
  formatters: ZoneFormatters = formattersFor(BOOKING_TIME_ZONE),
): WindowView {
  return {
    id: window.id,
    startsAt: window.starts_at,
    label: `${formatTime(window.starts_at, formatters)} – ${formatTime(window.ends_at, formatters)}`,
    startLabel: formatTime(window.starts_at, formatters),
    isAvailable: window.is_available,
    unavailableLabel: window.is_available
      ? null
      : (window.unavailable_reason && UNAVAILABLE_LABELS[window.unavailable_reason]) ??
        "Not available",
    durationLabel: `about ${estimatedDurationMinutes} min`,
    scarcityLabel:
      window.is_available && window.capacity === SOLE_REMAINING_PARTNER_CAPACITY
        ? "Only 1 pro left"
        : null,
  };
}

/**
 * Relative day labels, computed against the server's clock.
 *
 * `serverNow` rather than `Date.now()` because a device with a wrong date would
 * otherwise label the wrong day "Today" — and the customer would book it.
 */
function dayLabel(date: string, serverNow: string, formatters: ZoneFormatters): string {
  const todayKey = isoDateIn(new Date(serverNow), formatters);
  const tomorrowKey = isoDateIn(new Date(Date.parse(serverNow) + 86_400_000), formatters);

  if (date === todayKey) return "Today";
  if (date === tomorrowKey) return "Tomorrow";

  // Noon avoids the date flipping when the UTC instant and the calendar day
  // disagree at the boundary.
  return formatters.weekday.format(new Date(`${date}T12:00:00Z`));
}

/** The calendar date at `instant`, in the booking timezone. */
function isoDateIn(instant: Date, formatters: ZoneFormatters): string {
  return formatters.isoDate.format(instant);
}

function toDayView(
  day: PublishedWindowDay,
  serverNow: string,
  estimatedDurationMinutes: number,
  formatters: ZoneFormatters,
): WindowDayView {
  const windows = day.windows.map((window) =>
    toWindowView(window, estimatedDurationMinutes, formatters),
  );

  return {
    date: day.date,
    label: dayLabel(day.date, serverNow, formatters),
    dayOfMonth: formatters.dayNumber.format(new Date(`${day.date}T12:00:00Z`)),
    // Derived from the windows themselves. The published day carries no
    // `has_availability` flag, and deriving it is more truthful anyway: a day
    // is bookable exactly when one of its windows is.
    hasAvailability: windows.some((window) => window.isAvailable),
    windows,
  };
}

export function toWindowsView(response: PublishedWindows): WindowsView {
  const timeZone =
    "timezone" in response && typeof response.timezone === "string" && response.timezone
      ? response.timezone
      : BOOKING_TIME_ZONE;
  const formatters = formattersFor(timeZone);
  const days = response.days.map((day) =>
    toDayView(day, response.server_now, response.estimated_duration_minutes, formatters),
  );

  return {
    days,
    estimatedDurationMinutes: response.estimated_duration_minutes,
    // An empty result is a real answer and renders an empty state — never
    // conflated with the endpoint being unreachable, which throws.
    isEmpty: days.every((day) => !day.hasAvailability),
    isPreliminary: response.availability_is_preliminary,
  };
}
