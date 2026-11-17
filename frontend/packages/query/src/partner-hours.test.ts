import { describe, expect, it } from "vitest";

import { areasWithoutHours, presetPeriods } from "./partner-hours";

describe("hours presets", () => {
  it("fill every selected area, not only the first", () => {
    const periods = presetPeriods("weekdays", ["a", "b", "c"]);
    expect(periods).toHaveLength(15);
    for (const area of ["a", "b", "c"]) {
      expect(periods.filter((period) => period.serviceAreaId === area).map((period) => period.weekday)).toEqual([
        0, 1, 2, 3, 4,
      ]);
    }
  });

  it("full time adds Saturday", () => {
    expect(presetPeriods("fulltime", ["a"]).map((period) => period.weekday)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("are 9 to 6 and never overnight", () => {
    for (const period of presetPeriods("fulltime", ["a", "b"])) {
      expect(period).toMatchObject({ startsAt: "09:00", endsAt: "18:00", endsNextDay: false });
    }
  });

  it("names the areas that still have no hours", () => {
    expect(areasWithoutHours(["a", "b", "c"], [{ serviceAreaId: "a" }, { serviceAreaId: "a" }])).toEqual(["b", "c"]);
    expect(areasWithoutHours(["a"], [{ serviceAreaId: "a" }])).toEqual([]);
  });
});
