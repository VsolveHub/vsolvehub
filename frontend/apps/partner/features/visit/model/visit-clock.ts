import type { SiteVisit } from "./visit-state";
import { supportsTimeZone } from "./slot-grid";

/**
 * When a visit is, in the words a vendor standing in traffic can act on.
 *
 * ## Why this is not `timeAgo`
 *
 * `lib/format.ts`'s `timeAgo` is not relative despite the name — it returns an
 * absolute `"02 Sept 2026, 8:00 am"`. The visit panel used to render
 * `` `${when.label} (${timeAgo(scheduled_for)})` ``, which printed the same
 * instant twice in one row: *"Wed, 2 Sept, 8:00 am (02 Sept 2026, 8:00 am)"*.
 * A vendor reading that learns nothing from the second half, and still cannot
 * tell whether the job is today.
 *
 * So the one thing this module owes the screen is the answer to "is this now?"
 * — `Today` / `Tomorrow`, `starts in 16h 12m`, and the boolean that decides
 * whether the arrival control is even offered.
 *
 * ## Every instant here is the server's
 *
 * `nowMs` is passed in, and its only production caller is `serverClock.now()`.
 * Nothing in this file reads `Date.now()`. A device clock an hour fast would
 * otherwise open the arrival button a day early — the exact failure the gate
 * exists to prevent — and the house rule is already that no countdown subtracts
 * from a raw local clock.
 *
 * ## The day, not the hour
 *
 * The arrival window opens at **midnight of the visit's own calendar day in the
 * site's timezone**, and never closes again. Two deliberate choices:
 *
 * - Not T−2h (the phone-disclosure window): a vendor who arrives early for an
 *   8 am slot is doing the right thing, and a screen that refuses to record it
 *   teaches them the button lies.
 * - It never re-closes, because a visit that ran late — or that the vendor
 *   attended without their phone — still has to be closeable the next morning.
 *   Refusing arrival on a visit that already happened strands the estimate,
 *   which is the thing the customer actually paid for.
 */

export interface VisitTiming {
  /** "Today", "Tomorrow", or "Wed 2 Sept". */
  readonly dayLabel: string;
  /** "8:00 am", in the site's timezone. */
  readonly timeLabel: string;
  /** "Wed 2 Sept, 8:00 am" — for the one place that wants it on one line. */
  readonly fullLabel: string;
  /** "60 min on site", or null when the server did not publish a duration. */
  readonly durationLabel: string | null;
  /** True on the visit's own calendar day in the site's timezone. */
  readonly isVisitDay: boolean;
  /**
   * True from midnight of the visit day onward. What gates the arrival control
   * — see the note above on why it opens early and never shuts.
   */
  readonly arrivalWindowOpen: boolean;
  /** True once the slot's start time has passed. */
  readonly hasStarted: boolean;
  /** "starts in 16h 12m" / "started 12m ago". Null when it is too far to matter. */
  readonly relative: string | null;
  /**
   * "7:30 am" — thirty minutes before the slot.
   *
   * A reminder, not a travel estimate: this app knows where the *site* is and
   * nothing whatsoever about where the vendor will be leaving from, so it must
   * never be worded as an ETA or name an origin.
   */
  readonly leaveBy: string | null;
  /** The site's timezone is one this browser cannot resolve. */
  readonly zoneUnsupported: boolean;
}

const DAY_MS = 86_400_000;
const LEAVE_BY_LEAD_MS = 30 * 60_000;

function zoneOrUndefined(timeZone: string): { zone: string | undefined; unsupported: boolean } {
  const unsupported = timeZone.trim() === "" || !supportsTimeZone(timeZone);
  return { zone: unsupported ? undefined : timeZone, unsupported };
}

/**
 * The calendar day an instant falls on, in a given zone, as `YYYY-MM-DD`.
 *
 * `en-CA` because it is the one widely-shipped locale whose numeric date format
 * *is* ISO order, which makes the result both comparable as a string and
 * parseable back into a UTC midnight for day arithmetic.
 */
export function dayKeyInZone(epochMs: number, timeZone: string): string {
  const { zone } = zoneOrUndefined(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochMs));
}

function timeIn(epochMs: number, zone: string | undefined): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(epochMs));
}

function dayIn(epochMs: number, zone: string | undefined): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(epochMs));
}

/**
 * "8:04 am" — one instant, in the site's own timezone, with no date attached.
 *
 * For the rows where the date is already established by the block above them
 * and repeating it is the noise this module exists to remove.
 */
export function timeOnlyInZone(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return timeIn(ms, zoneOrUndefined(timeZone).zone);
}

/** Whole days between two `YYYY-MM-DD` keys. Positive when `to` is later. */
function dayGap(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

function relativeLabel(deltaMs: number): string | null {
  if (deltaMs >= 0) {
    const minutes = Math.floor(deltaMs / 60_000);
    if (minutes < 1) return "starts in under a minute";
    if (minutes < 60) return `starts in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `starts in ${hours}h ${minutes % 60}m`;
    return `starts in ${Math.round(hours / 24)} days`;
  }

  const minutesAgo = Math.floor(-deltaMs / 60_000);
  if (minutesAgo < 1) return "starting now";
  if (minutesAgo < 60) return `started ${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  // Past a day there is nothing useful left to say: the screen shows the date,
  // and "started 9 days ago" is a reproach, not information.
  if (hoursAgo < 24) return `started ${hoursAgo}h ago`;
  return null;
}

/**
 * @param visit The plan visit. `scheduled_for` null means the slot is still
 *   held against an unverified customer payment — there is no time to describe.
 * @param nowMs The server's clock. Production callers pass `serverClock.now()`.
 */
export function describeVisitTiming(visit: SiteVisit, nowMs: number): VisitTiming | null {
  if (visit.scheduled_for === null || visit.scheduled_for === "") return null;
  const startMs = Date.parse(visit.scheduled_for);
  if (!Number.isFinite(startMs)) return null;

  const { zone, unsupported } = zoneOrUndefined(visit.timezone);
  const todayKey = dayKeyInZone(nowMs, visit.timezone);
  const visitKey = dayKeyInZone(startMs, visit.timezone);
  const gap = dayGap(todayKey, visitKey);

  const dayLabel = gap === 0 ? "Today" : gap === 1 ? "Tomorrow" : dayIn(startMs, zone);
  const timeLabel = timeIn(startMs, zone);
  const hasStarted = nowMs >= startMs;

  return {
    dayLabel,
    timeLabel,
    fullLabel: `${dayIn(startMs, zone)}, ${timeLabel}`,
    durationLabel:
      visit.duration_minutes === null ? null : `${visit.duration_minutes} min on site`,
    isVisitDay: gap === 0,
    arrivalWindowOpen: gap <= 0,
    hasStarted,
    relative: relativeLabel(startMs - nowMs),
    leaveBy: hasStarted ? null : timeIn(startMs - LEAVE_BY_LEAD_MS, zone),
    zoneUnsupported: unsupported,
  };
}
