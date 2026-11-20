/**
 * Weekly working hours for onboarding, shared by the website and the phone apps.
 *
 * Django stores hours per service area (`PartnerAvailabilityRule`). To keep Step 4
 * simple for the partner, the client presents a single weekly editor across all areas.
 * Saving expands that single schedule across every ticked area (`expandWeeklySet`).
 *
 * If an older draft had different hours per area, `collapseToWeeklySet` collapses them
 * to one schedule and flags `differed: true` so the UI shows:
 * "Saving uses these hours for all your areas."
 */

export type HoursPreset = "fulltime" | "weekdays";

export interface WeeklyShift {
  weekday: number;
  startsAt: string;
  endsAt: string;
  endsNextDay: boolean;
}

/** A shift with its associated service area. */
export interface PresetPeriod extends WeeklyShift {
  serviceAreaId: string;
}

export interface AreaRule extends WeeklyShift {
  serviceAreaId: string;
}

export interface AreaException {
  serviceAreaId: string;
  date: string;
  isAvailable?: boolean;
  is_available?: boolean;
  startsAt?: string | null;
  starts_at?: string | null;
  endsAt?: string | null;
  ends_at?: string | null;
  endsNextDay?: boolean;
  ends_next_day?: boolean;
  reason?: string | null;
}

/** Monday is 0. Full time is Monday to Saturday, weekdays is Monday to Friday. */
const PRESET_DAYS: Record<HoursPreset, readonly number[]> = {
  fulltime: [0, 1, 2, 3, 4, 5],
  weekdays: [0, 1, 2, 3, 4],
};

/** 9 AM to 6 PM on the preset's days, in every one of the given areas. */
export function presetPeriods(preset: HoursPreset, areaIds: readonly string[]): PresetPeriod[] {
  return areaIds.flatMap((serviceAreaId) =>
    PRESET_DAYS[preset].map((weekday) => ({
      serviceAreaId,
      weekday,
      startsAt: "09:00",
      endsAt: "18:00",
      endsNextDay: false,
    })),
  );
}

/** Areas that still have no hours at all, which Django refuses at submit. */
export function areasWithoutHours(
  areaIds: readonly string[],
  periods: readonly { serviceAreaId: string }[],
): string[] {
  const covered = new Set(periods.map((period) => period.serviceAreaId));
  return areaIds.filter((areaId) => !covered.has(areaId));
}

/**
 * Expands a single weekly set of shifts across every selected area.
 */
export function expandWeeklySet<T extends WeeklyShift>(
  shifts: readonly T[],
  areaIds: readonly string[],
): (T & { serviceAreaId: string })[] {
  return areaIds.flatMap((serviceAreaId) =>
    shifts.map((shift) => ({
      ...shift,
      serviceAreaId,
    })),
  );
}

/**
 * Collapses multi-area rules to a single weekly schedule.
 * Picks the area with the most active rules, and detects if other areas differed.
 */
export function collapseToWeeklySet<T extends AreaRule>(
  rules: readonly T[],
): {
  shifts: WeeklyShift[];
  differed: boolean;
} {
  if (rules.length === 0) {
    return { shifts: [], differed: false };
  }

  // Group rules by serviceAreaId
  const areaGroups = new Map<string, T[]>();
  for (const rule of rules) {
    const list = areaGroups.get(rule.serviceAreaId) ?? [];
    list.push(rule);
    areaGroups.set(rule.serviceAreaId, list);
  }

  // Pick the area with the most active rules (ties broken by area ID)
  let primaryAreaId = "";
  let primaryRules: T[] = [];
  for (const [areaId, group] of areaGroups.entries()) {
    if (
      group.length > primaryRules.length ||
      (group.length === primaryRules.length && (!primaryAreaId || areaId < primaryAreaId))
    ) {
      primaryAreaId = areaId;
      primaryRules = group;
    }
  }

  function shiftSignature(s: WeeklyShift): string {
    return `${s.weekday}:${s.startsAt}-${s.endsAt}:${s.endsNextDay}`;
  }

  const primarySig = primaryRules
    .map(shiftSignature)
    .sort()
    .join("|");

  let differed = false;
  for (const [areaId, group] of areaGroups.entries()) {
    if (areaId === primaryAreaId) continue;
    const groupSig = group
      .map(shiftSignature)
      .sort()
      .join("|");
    if (groupSig !== primarySig) {
      differed = true;
      break;
    }
  }

  const shifts: WeeklyShift[] = primaryRules.map((r) => ({
    weekday: r.weekday,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    endsNextDay: r.endsNextDay,
  }));

  return { shifts, differed };
}

/**
 * Copies dated exceptions across all given areas.
 */
export function expandExceptions<T extends { serviceAreaId: string }>(
  exceptions: readonly T[],
  areaIds: readonly string[],
): T[] {
  if (exceptions.length === 0 || areaIds.length === 0) return [];
  const uniqueList: T[] = [];
  const seen = new Set<string>();

  for (const ex of exceptions) {
    const copy = { ...ex, serviceAreaId: "" };
    const key = JSON.stringify(copy);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueList.push(ex);
    }
  }

  return areaIds.flatMap((serviceAreaId) =>
    uniqueList.map((ex) => ({
      ...ex,
      serviceAreaId,
    })),
  );
}
