import type { Schemas } from "@vsolve/api-client";

/**
 * Reading `VisitSlotGrid` into something a picker can render.
 *
 * Closes the decision half of `M2-FE-314`. Pure — no React, no network — so
 * every rule below is a function of the payload and nothing else.
 *
 * ## The browser never computes availability
 *
 * Not "does not currently"; **may not**. `VisitSlotGrid` is the Partner-side twin
 * of `POST /api/v1/booking/windows/`, drawn from the same `carts.availability`
 * snapshot and the same window loop, narrowed to the one invited vendor. Every
 * `is_available` and every `unavailable_reason` on it is the server's answer.
 * Nothing here filters a slot out, re-derives one, or decides that a time "looks
 * bookable" — a second implementation of that rule in a browser is how a vendor
 * ends up confirming a visit the planner refuses.
 *
 * `capacity` is deliberately absent from this grid, unlike the A1 one. On a
 * single-vendor grid it would be a live readout of that vendor's own diary
 * depth, which a slot picker does not need and which is not this vendor's
 * business to see aggregated.
 *
 * ## `id` is a signed token, and it is treated as opaque
 *
 * Each slot id is bound to this invitation and this start, and it is the only
 * thing `POST` accepts — a vendor cannot book a time the grid never offered or a
 * slot drawn for a competitor. So it is carried through unchanged and **never
 * parsed**: no time is reconstructed from it, no id is synthesised, and the
 * label a vendor reads comes from `starts_at`/`ends_at` beside it rather than
 * from the token.
 *
 * Tokens expire. A picker left open therefore has to re-read rather than post a
 * stale one, which is why the grid query is `EXPIRING_STATE` and why
 * `m2_visit_slot_unavailable` recovers by refreshing the grid rather than by
 * retrying the same id.
 */

export type VisitSlotGrid = Schemas["VisitSlotGrid"];
export type UnavailableReason = Schemas["UnavailableReasonEnum"];

export interface SlotOption {
  /** The signed token. Opaque: posted back exactly as received, never parsed. */
  readonly token: string;
  /** "9:00 am – 9:45 am", in the grid's own timezone. */
  readonly label: string;
  readonly isAvailable: boolean;
  /** Why not, in the vendor's terms. Null when the slot is open. */
  readonly unavailableLabel: string | null;
  readonly unavailableReason: UnavailableReason | null;
}

export interface SlotDay {
  /** The server's `YYYY-MM-DD`. Used as a key, never re-parsed into a time. */
  readonly date: string;
  /** "Today", or "Tue 18 Aug". */
  readonly label: string;
  readonly isToday: boolean;
  readonly slots: readonly SlotOption[];
  readonly openCount: number;
}

export interface SlotGridView {
  readonly days: readonly SlotDay[];
  readonly timezone: string;
  /**
   * True when this runtime does not know the server's timezone and the times
   * above are therefore in the reader's own zone.
   *
   * Stated rather than swallowed: a vendor deciding whether to travel at 9am
   * needs to know whose 9am it is, and a silent fallback is how the two diverge
   * by hours without anybody noticing.
   */
  readonly timezoneUnsupported: boolean;
  readonly visitDurationMinutes: number;
  /**
   * The server's own caveat that the grid is a snapshot, not a reservation.
   *
   * Passed straight through. It means a slot shown open may be gone by the time
   * it is posted — which is the ordinary `m2_visit_slot_unavailable` path, not a
   * failure.
   */
  readonly isPreliminary: boolean;
  readonly serverNow: string;
  readonly openCount: number;
  readonly slotCount: number;
}

const REASON_COPY: Record<UnavailableReason, string> = {
  PAST: "Already gone",
  TOO_SOON: "Too soon to reach",
  OUTSIDE_OPERATING_WINDOW: "Outside working hours here",
  NO_CAPACITY: "You are not free",
};

export function describeUnavailableReason(reason: UnavailableReason | null): string {
  return reason === null ? "Not available" : REASON_COPY[reason];
}

/**
 * Whether a timezone is one this runtime can format in.
 *
 * `Intl.DateTimeFormat` throws a `RangeError` on an IANA name it does not carry,
 * and an old WebView on a cheap Android phone is exactly the device a vendor
 * reads this on. Probing once beats a try/catch around every slot.
 */
function supportsTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function timeFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

function dayFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * The grid as the picker renders it.
 *
 * Order is the server's throughout — days in the order they arrived, slots in
 * the order inside each day. Re-sorting would put this client in charge of an
 * ordering the availability engine owns, and a vendor who learns where tomorrow
 * morning sits should find it in the same place tomorrow.
 */
export function readSlotGrid(grid: VisitSlotGrid): SlotGridView {
  const unsupported = !supportsTimeZone(grid.timezone);
  const zone = unsupported ? undefined : grid.timezone;
  const time = timeFormatter(zone);
  const day = dayFormatter(zone);

  let openCount = 0;
  let slotCount = 0;

  const days: SlotDay[] = grid.days.map((row) => {
    const slots: SlotOption[] = row.slots.map((slot) => {
      slotCount += 1;
      if (slot.is_available) openCount += 1;
      const reason = slot.unavailable_reason ?? null;
      return {
        token: slot.id,
        label: `${time.format(new Date(slot.starts_at))} – ${time.format(new Date(slot.ends_at))}`,
        isAvailable: slot.is_available,
        unavailableLabel: slot.is_available ? null : describeUnavailableReason(reason),
        unavailableReason: reason,
      };
    });

    return {
      date: row.date,
      // The date is formatted from the first slot's own instant rather than from
      // the `YYYY-MM-DD` string: parsing a bare date string is UTC-midnight in
      // some runtimes and local-midnight in others, which shifts the label by a
      // day either side of the international date line.
      label: row.is_today
        ? "Today"
        : row.slots[0]
          ? day.format(new Date(row.slots[0].starts_at))
          : row.date,
      isToday: row.is_today,
      slots,
      openCount: slots.filter((slot) => slot.isAvailable).length,
    };
  });

  return {
    days,
    timezone: grid.timezone,
    timezoneUnsupported: unsupported,
    visitDurationMinutes: grid.visit_duration_minutes,
    isPreliminary: grid.availability_is_preliminary,
    serverNow: grid.server_now,
    openCount,
    slotCount,
  };
}

/* ---------------------------------------------------------------------------
   The four shapes a grid can take
   --------------------------------------------------------------------------- */

/**
 * What this grid is telling the vendor.
 *
 * - `open` — at least one slot can be confirmed.
 * - `ineligible` — every slot reads `NO_CAPACITY`. **This is a grid, not an
 *   error and not an empty screen.** The server draws it deliberately: an
 *   ineligible vendor is shown the times that exist and told they are not free
 *   for any of them, because "your service, area or calendar does not cover this
 *   work" is the truth and it is renderable. A 403 in its place would tell a
 *   vendor their account is broken.
 * - `closed` — slots exist and are all unavailable for mixed reasons: past, too
 *   soon, outside working hours. Different sentence, same grid.
 * - `empty` — the server drew no slots at all. Rare, and it is the one case with
 *   nothing to render.
 */
export type GridShape = "open" | "ineligible" | "closed" | "empty";

export function gridShape(view: SlotGridView): GridShape {
  if (view.slotCount === 0) return "empty";
  if (view.openCount > 0) return "open";
  const everySlotNoCapacity = view.days.every((day) =>
    day.slots.every((slot) => slot.unavailableReason === "NO_CAPACITY"),
  );
  return everySlotNoCapacity ? "ineligible" : "closed";
}

export interface GridNotice {
  readonly title: string;
  readonly message: string;
}

export function describeGrid(shape: GridShape): GridNotice | null {
  switch (shape) {
    case "open":
      return null;
    case "ineligible":
      return {
        title: "No slot on this request is open to you",
        message:
          "Every time below is closed to you. That means your service, your area or your calendar does not cover this work — you may already be committed on these dates, the site may be outside the areas you cover, or this is not work your approved capability includes. Nothing is wrong with your account and nothing counts against you.",
      };
    case "closed":
      return {
        title: "None of these times can be booked",
        message:
          "The times below are past, too soon to reach, or outside working hours for this area. Check back — the grid is redrawn every time you open this screen.",
      };
    case "empty":
      return {
        title: "Vsolve has no times to offer for this request",
        message:
          "No visit times have been drawn for this request yet. This is not a decision about you. Try again shortly, and tell support if it stays empty.",
      };
  }
}

/**
 * How long the vendor is committing to be on site.
 *
 * Plain minutes, in the vendor's language, because it is the number they weigh
 * against the journey. Never rounded up into "about an hour" — a 45-minute slot
 * booked against an hour's expectation is a vendor late for their next job.
 */
export function describeVisitDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return rest === 0 ? hourPart : `${hourPart} ${rest} minutes`;
}
