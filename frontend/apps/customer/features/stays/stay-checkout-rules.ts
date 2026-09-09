export type StayDurationMode = "MONTHLY" | "WEEKLY" | "NIGHTLY";

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

export function shouldShowOccupantPicker(occupancyModel?: string | null): boolean {
  return occupancyModel !== "SHARED";
}

export function holdGuestCount(
  occupancyModel: string | null | undefined,
  selectedGuests: number,
): number {
  if (occupancyModel === "SHARED") return 1;
  return Math.max(1, selectedGuests);
}

export function occupancyGuestCap(card: {
  occupancy_model?: string | null;
  occupancy_capacity?: number | null;
}): number {
  if (card.occupancy_model === "SHARED") return 1;
  if (typeof card.occupancy_capacity === "number" && card.occupancy_capacity > 0) {
    return card.occupancy_capacity;
  }
  return 5;
}

export function hideSoldOutStayCards<T extends { units_available: number }>(
  cards: T[],
  datesSet: boolean,
): T[] {
  if (!datesSet) return cards;
  return cards.filter((card) => card.units_available > 0);
}
