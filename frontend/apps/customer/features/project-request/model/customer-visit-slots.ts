import type { Schemas } from "@vsolve/api-client";

export type CustomerVisitSlotGrid = Schemas["VisitSlotGrid"];
type UnavailableReason = Schemas["UnavailableReasonEnum"];

export interface CustomerVisitSlotOption {
  /** Opaque signed token, posted back exactly as published. */
  readonly token: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly label: string;
  readonly isAvailable: boolean;
  readonly unavailableLabel: string | null;
}

export interface CustomerVisitSlotDay {
  readonly date: string;
  readonly label: string;
  readonly spokenLabel: string;
  readonly slots: readonly CustomerVisitSlotOption[];
  readonly openCount: number;
}

export interface CustomerVisitSlotGridView {
  readonly days: readonly CustomerVisitSlotDay[];
  readonly timezone: string;
  readonly timezoneUnsupported: boolean;
  readonly serverNow: string;
  readonly visitDurationMinutes: number;
  /**
   * Minutes a professional needs to travel between two jobs.
   *
   * Load-bearing, not decorative. The server refuses a slot that falls inside another
   * visit's duration **plus** this gap, so a picker that ignores it offers times the write
   * rejects: with a 60-minute visit and a 20-minute turnaround, 5pm and 6pm look an hour
   * apart and clash. Published since 1.64.0 for exactly this reason.
   */
  readonly turnaroundMinutes: number;
  readonly openCount: number;
}

const UNAVAILABLE_COPY: Record<UnavailableReason, string> = {
  PAST: "Already passed",
  TOO_SOON: "Too soon",
  OUTSIDE_OPERATING_WINDOW: "Outside working hours",
  NO_CAPACITY: "No professional available",
};

function supportsTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function formatters(timeZone: string | undefined) {
  return {
    day: new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(timeZone ? { timeZone } : {}),
    }),
    spokenDay: new Intl.DateTimeFormat("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(timeZone ? { timeZone } : {}),
    }),
    time: new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    }),
  };
}

/** Convert the server grid into labels without ever recomputing availability. */
export function readCustomerVisitSlotGrid(
  grid: CustomerVisitSlotGrid,
): CustomerVisitSlotGridView {
  const timezoneUnsupported = !supportsTimeZone(grid.timezone);
  const formatter = formatters(timezoneUnsupported ? undefined : grid.timezone);
  let openCount = 0;

  const days = grid.days.map((row) => {
    const slots = row.slots.map((slot) => {
      if (slot.is_available) openCount += 1;
      return {
        token: slot.id,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        label: `${formatter.time.format(new Date(slot.starts_at))} – ${formatter.time.format(
          new Date(slot.ends_at),
        )}`,
        isAvailable: slot.is_available,
        unavailableLabel: slot.is_available
          ? null
          : UNAVAILABLE_COPY[slot.unavailable_reason ?? "NO_CAPACITY"],
      };
    });
    const first = row.slots[0];
    const instant = first === undefined ? new Date(`${row.date}T12:00:00`) : new Date(first.starts_at);
    return {
      date: row.date,
      label: row.is_today ? "Today" : formatter.day.format(instant),
      spokenLabel: formatter.spokenDay.format(instant),
      slots,
      openCount: slots.filter((slot) => slot.isAvailable).length,
    };
  });

  return {
    days,
    timezone: grid.timezone,
    timezoneUnsupported,
    serverNow: grid.server_now,
    visitDurationMinutes: grid.visit_duration_minutes,
    turnaroundMinutes: grid.turnaround_minutes,
    openCount,
  };
}

export function findCustomerVisitSlot(
  grid: CustomerVisitSlotGridView | null,
  startsAt: string | null,
): CustomerVisitSlotOption | null {
  if (grid === null || startsAt === null) return null;
  for (const day of grid.days) {
    const slot = day.slots.find((candidate) => candidate.startsAt === startsAt);
    if (slot !== undefined) return slot;
  }
  return null;
}

/**
 * Do two slots clash, counting the travel time between them?
 *
 * Mirrors the server's `occupied_range_bounds`: a visit occupies its own window *plus* the
 * turnaround, so two adjacent hours are a clash rather than a tidy back-to-back pair. The
 * naive version of this compared the raw windows and called 5pm and 6pm compatible — which
 * is how the picker came to offer a time the write then refused.
 *
 * The gap is applied to both sides, because neither visit may start before the other has
 * been travelled away from.
 */
function overlaps(
  left: CustomerVisitSlotOption,
  right: CustomerVisitSlotOption,
  turnaroundMinutes = 0,
): boolean {
  const gap = turnaroundMinutes * 60_000;
  const leftEnd = new Date(left.endsAt).getTime() + gap;
  const rightEnd = new Date(right.endsAt).getTime() + gap;
  const leftStart = new Date(left.startsAt).getTime();
  const rightStart = new Date(right.startsAt).getTime();
  return leftStart < rightEnd && rightStart < leftEnd;
}

/** A slot cannot collide with a sibling visit already chosen by the Customer. */
export function slotOverlapsAnotherSelection({
  slot,
  selectedStarts,
  visitIndex,
  grid,
  blockedStarts = [],
}: {
  slot: CustomerVisitSlotOption;
  selectedStarts: readonly (string | null)[];
  visitIndex: number;
  grid: CustomerVisitSlotGridView;
  /**
   * Times held by visits this picker is *not* editing.
   *
   * The request wizard edits every visit at once, so `selectedStarts` is the whole
   * picture and this stays empty. Re-timing one exhausted slot on a live plan does not:
   * the picker shows one row and the visit that already matched is nowhere in it, so
   * without this the only clash that can actually happen is the one clash not checked.
   */
  blockedStarts?: readonly string[];
}): boolean {
  const clashes = (startsAt: string | null): boolean => {
    if (startsAt === null) return false;
    const selected = findCustomerVisitSlot(grid, startsAt);
    return selected !== null && overlaps(slot, selected, grid.turnaroundMinutes);
  };
  return (
    selectedStarts.some((startsAt, index) => index !== visitIndex && clashes(startsAt)) ||
    blockedStarts.some(clashes)
  );
}

/** Resolve current signed tokens only when every visible visit has a valid time. */
export function tokensForCustomerVisitSelection(
  grid: CustomerVisitSlotGridView | null,
  selectedStarts: readonly (string | null)[],
  planSize: number | null,
): readonly string[] | null {
  if (grid === null || planSize === null || selectedStarts.length !== planSize) return null;
  const selected: CustomerVisitSlotOption[] = [];
  for (const startsAt of selectedStarts) {
    const slot = findCustomerVisitSlot(grid, startsAt);
    if (slot === null || !slot.isAvailable) return null;
    if (selected.some((sibling) => overlaps(slot, sibling, grid.turnaroundMinutes))) return null;
    selected.push(slot);
  }
  return selected.map((slot) => slot.token);
}

export function customerVisitSelectionVersion(
  grid: CustomerVisitSlotGridView,
  selectedStarts: readonly string[],
): string {
  return `${grid.serverNow}:${selectedStarts.join(",")}`;
}

