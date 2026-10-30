import { describe, expect, it } from "vitest";

import { matchingRange, rangeDates } from "./date-ranges";

const TODAY = new Date(2026, 9, 29, 15, 30); // 29 Oct 2026, local time

describe("quick date ranges", () => {
  it("gives whole local days", () => {
    expect(rangeDates("today", TODAY)).toEqual({ date_start: "2026-10-29", date_end: "2026-10-29" });
    expect(rangeDates("yesterday", TODAY)).toEqual({ date_start: "2026-10-28", date_end: "2026-10-28" });
    expect(rangeDates("last_7_days", TODAY)).toEqual({ date_start: "2026-10-23", date_end: "2026-10-29" });
    expect(rangeDates("this_month", TODAY)).toEqual({ date_start: "2026-10-01", date_end: "2026-10-29" });
    expect(rangeDates("last_month", TODAY)).toEqual({ date_start: "2026-09-01", date_end: "2026-09-30" });
    expect(rangeDates("all", TODAY)).toEqual({ date_start: "", date_end: "" });
  });

  it("crosses a year for last month in January", () => {
    expect(rangeDates("last_month", new Date(2026, 0, 10))).toEqual({
      date_start: "2025-12-01",
      date_end: "2025-12-31",
    });
  });

  it("names the range a pair of dates is, and nothing for a custom pair", () => {
    expect(matchingRange("2026-10-01", "2026-10-29", TODAY)).toBe("this_month");
    expect(matchingRange("", "", TODAY)).toBe("all");
    expect(matchingRange("2026-10-05", "2026-10-09", TODAY)).toBeNull();
  });
});
