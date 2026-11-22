import { describe, expect, it } from "vitest";

import {
  areasWithoutHours,
  collapseToWeeklySet,
  expandExceptions,
  expandWeeklySet,
  presetPeriods,
} from "./partner-hours";

describe("hours presets", () => {
  it("fill every selected area, not only the first", () => {
    const periods = presetPeriods("weekdays", ["a", "b", "c"]);
    expect(periods).toHaveLength(15);
    for (const area of ["a", "b", "c"]) {
      expect(
        periods.filter((period) => period.serviceAreaId === area).map((period) => period.weekday),
      ).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("full time adds Saturday", () => {
    expect(presetPeriods("fulltime", ["a"]).map((period) => period.weekday)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("are 9 to 6 and never overnight", () => {
    for (const period of presetPeriods("fulltime", ["a", "b"])) {
      expect(period).toMatchObject({ startsAt: "09:00", endsAt: "18:00", endsNextDay: false });
    }
  });

  it("names the areas that still have no hours", () => {
    expect(
      areasWithoutHours(["a", "b", "c"], [{ serviceAreaId: "a" }, { serviceAreaId: "a" }]),
    ).toEqual(["b", "c"]);
    expect(areasWithoutHours(["a"], [{ serviceAreaId: "a" }])).toEqual([]);
  });
});

describe("expandWeeklySet", () => {
  it("duplicates weekly shifts for each area", () => {
    const shifts = [
      { weekday: 0, startsAt: "09:00", endsAt: "17:00", endsNextDay: false },
      { weekday: 1, startsAt: "10:00", endsAt: "18:00", endsNextDay: false },
    ];
    const expanded = expandWeeklySet(shifts, ["area-1", "area-2"]);
    expect(expanded).toHaveLength(4);
    expect(expanded.filter((r) => r.serviceAreaId === "area-1")).toMatchObject(shifts);
    expect(expanded.filter((r) => r.serviceAreaId === "area-2")).toMatchObject(shifts);
  });
});

describe("collapseToWeeklySet", () => {
  it("returns empty when no rules exist", () => {
    expect(collapseToWeeklySet([])).toEqual({ shifts: [], differed: false });
  });

  it("collapses identical schedules across areas with differed: false", () => {
    const rules = [
      { serviceAreaId: "area-1", weekday: 0, startsAt: "09:00", endsAt: "17:00", endsNextDay: false },
      { serviceAreaId: "area-2", weekday: 0, startsAt: "09:00", endsAt: "17:00", endsNextDay: false },
    ];
    const result = collapseToWeeklySet(rules);
    expect(result.differed).toBe(false);
    expect(result.shifts).toEqual([
      { weekday: 0, startsAt: "09:00", endsAt: "17:00", endsNextDay: false },
    ]);
  });

  it("detects differences and returns differed: true", () => {
    const rules = [
      { serviceAreaId: "area-1", weekday: 0, startsAt: "09:00", endsAt: "17:00", endsNextDay: false },
      { serviceAreaId: "area-1", weekday: 1, startsAt: "09:00", endsAt: "17:00", endsNextDay: false },
      { serviceAreaId: "area-2", weekday: 0, startsAt: "10:00", endsAt: "18:00", endsNextDay: false },
    ];
    const result = collapseToWeeklySet(rules);
    expect(result.differed).toBe(true);
    // Picks area-1 since it has 2 rules vs area-2's 1 rule
    expect(result.shifts).toHaveLength(2);
  });
});

describe("expandExceptions", () => {
  it("copies dated exceptions to all areas", () => {
    const exceptions = [
      { serviceAreaId: "area-1", date: "2026-12-25", isAvailable: false, reason: "Christmas" },
    ];
    const expanded = expandExceptions(exceptions, ["area-1", "area-2"]);
    expect(expanded).toHaveLength(2);
    expect(expanded.find((e) => e.serviceAreaId === "area-1")?.date).toBe("2026-12-25");
    expect(expanded.find((e) => e.serviceAreaId === "area-2")?.date).toBe("2026-12-25");
  });
});
