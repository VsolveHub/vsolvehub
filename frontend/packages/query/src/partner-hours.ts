/**
 * Weekly working hours for onboarding, shared by the website and the phone apps.
 *
 * Django will not accept an application until **every** selected service area has hours. The
 * presets ("Full time", "Weekdays") used to fill only the first area, so a partner who chose five
 * areas had four to set up by hand, one shift at a time.
 */

export type HoursPreset = "fulltime" | "weekdays";

/** A shift without the local key each screen adds for React. */
export interface PresetPeriod {
  serviceAreaId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  endsNextDay: boolean;
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
