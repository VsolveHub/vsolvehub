/**
 * Shared occupancy-model presentation logic for Stays (A9_STAY).
 *
 * There are three occupancy models set by the backend on a Property/UnitType:
 *   - SHARED       (PG/hostel/co-living — customer always books exactly 1 bed)
 *   - ENTIRE_UNIT  (flat/villa/house — customer books the whole unit, up to capacity)
 *   - HOTEL_ROOM   (hotel room — booked like ENTIRE_UNIT but shown with hotel conventions)
 *
 * This module is the single source of truth for how that distinction is
 * surfaced in the UI (guest picker visibility, "sleeps N"/"sharing"/room-class
 * labels, vacancy wording, default dates). It replaces logic that used to be
 * copy-pasted with slightly different shapes across the customer, partner and
 * ops frontends — see Django_Next.js_Plan/M3/07-a9-stays-ux-overhaul-plan.md
 * (Wave U0) for why this consolidation exists. Pure functions only, no React,
 * so it is safe to import from any app.
 */

export type StayOccupancyModel = "SHARED" | "ENTIRE_UNIT" | "HOTEL_ROOM" | (string & {});

export type StayDurationMode = "MONTHLY" | "WEEKLY" | "NIGHTLY";

export const ROOM_CLASS_LABELS: Record<string, string> = {
  SINGLE: "Single",
  DOUBLE: "Double",
  TWIN: "Twin",
  DELUXE: "Deluxe",
  SUITE: "Suite",
  EXECUTIVE: "Executive",
};

// ---------------------------------------------------------------------------
// Dates & duration
// ---------------------------------------------------------------------------

export function isoDatePlusDays(fromIso: string, days: number): string {
  const d = new Date(`${fromIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function defaultStayStartDate(): string {
  return isoDatePlusDays(new Date().toISOString().slice(0, 10), 1);
}

export function defaultStayEndDate(opts?: { hotel?: boolean }): string {
  const start = defaultStayStartDate();
  return isoDatePlusDays(start, opts?.hotel ? 1 : 30);
}

export function stayNights(startDate: string, endDate: string): number {
  return Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) || 1,
  );
}

export function leaseMonthsFromDates(startDate: string, endDate: string): number {
  return Math.max(1, Math.round(stayNights(startDate, endDate) / 30) || 1);
}

export function publishedDurationModes(
  supported?: string[] | null,
  fallback?: string | null,
): StayDurationMode[] {
  const source =
    supported && supported.length > 0 ? supported : fallback ? [fallback] : [];
  const mapped: StayDurationMode[] = [];
  for (const raw of source) {
    const mode = raw === "DAILY" ? "NIGHTLY" : raw;
    if (mode === "MONTHLY" || mode === "WEEKLY" || mode === "NIGHTLY") {
      if (!mapped.includes(mode)) mapped.push(mode);
    }
  }
  return mapped;
}

export function shouldShowDurationToggle(modes: StayDurationMode[]): boolean {
  return modes.length > 1;
}

export function durationModeLabel(mode: StayDurationMode): string {
  if (mode === "MONTHLY") return "Monthly";
  if (mode === "WEEKLY") return "Weekly";
  return "Nightly";
}

// ---------------------------------------------------------------------------
// Occupant / guest picker
// ---------------------------------------------------------------------------

export function shouldShowOccupantPicker(occupancyModel?: StayOccupancyModel | null): boolean {
  return occupancyModel !== "SHARED";
}

export function holdGuestCount(
  occupancyModel: StayOccupancyModel | null | undefined,
  selectedGuests: number,
): number {
  if (occupancyModel === "SHARED") return 1;
  return Math.max(1, selectedGuests);
}

export function occupancyGuestCap(card: {
  occupancy_model?: StayOccupancyModel | null;
  occupancy_capacity?: number | null;
}): number {
  if (card.occupancy_model === "SHARED") return 1;
  if (typeof card.occupancy_capacity === "number" && card.occupancy_capacity > 0) {
    return card.occupancy_capacity;
  }
  return 5;
}

// ---------------------------------------------------------------------------
// Card / listing presentation
// ---------------------------------------------------------------------------

export interface OccupancyLabelInput {
  occupancy_model?: StayOccupancyModel | null;
  occupancy_capacity?: number | null;
  room_class?: string | null;
  sharing_display?: string | null;
}

/**
 * The short chip shown on a unit-type/property card: room class for hotels,
 * "Sleeps N" for entire-unit, sharing type (e.g. "2 Sharing") for shared.
 */
export function occupancyLabel(card: OccupancyLabelInput): string | null {
  if (card.occupancy_model === "HOTEL_ROOM") {
    const code = card.room_class || "";
    return ROOM_CLASS_LABELS[code] || card.room_class || null;
  }
  if (card.occupancy_model === "ENTIRE_UNIT") {
    return card.occupancy_capacity ? `Sleeps ${card.occupancy_capacity}` : null;
  }
  return card.sharing_display || null;
}

/**
 * Vacancy copy for a card, e.g. "3 rooms left" (hotel) vs "3 units available"
 * (shared/entire-unit), including the zero-availability wording.
 */
export function vacancyLabel(
  unitsAvailable: number,
  occupancyModel?: StayOccupancyModel | null,
): string {
  const isHotel = occupancyModel === "HOTEL_ROOM";
  if (unitsAvailable > 0) {
    return isHotel
      ? `${unitsAvailable} room${unitsAvailable > 1 ? "s" : ""} left`
      : `${unitsAvailable} unit${unitsAvailable > 1 ? "s" : ""} available`;
  }
  return isHotel ? "No rooms left" : "No units available";
}

export function hideSoldOutStayCards<T extends { units_available: number }>(
  cards: T[],
  datesSet: boolean,
): T[] {
  if (!datesSet) return cards;
  return cards.filter((card) => card.units_available > 0);
}
