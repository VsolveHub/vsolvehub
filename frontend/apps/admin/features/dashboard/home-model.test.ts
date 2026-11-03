import { describe, expect, it } from "vitest";

import { changeBetween, describeChange, periodRanges, totalBookings } from "./home-model";

describe("home period ranges", () => {
  const today = new Date(2026, 10, 3); // 3 Nov 2026, local time

  it("compares today with yesterday", () => {
    expect(periodRanges("today", today)).toEqual({
      current: { start: "2026-11-03", end: "2026-11-03" },
      previous: { start: "2026-11-02", end: "2026-11-02" },
    });
  });

  it("compares the last 7 days with the 7 before, across a month boundary", () => {
    expect(periodRanges("7d", today)).toEqual({
      current: { start: "2026-10-28", end: "2026-11-03" },
      previous: { start: "2026-10-21", end: "2026-10-27" },
    });
  });

  it("covers 30 whole days each side", () => {
    const { current, previous } = periodRanges("30d", today);
    expect(current).toEqual({ start: "2026-10-05", end: "2026-11-03" });
    expect(previous).toEqual({ start: "2026-09-05", end: "2026-10-04" });
  });
});

describe("how a figure moved", () => {
  it("quotes a whole percentage against a non-zero base", () => {
    expect(changeBetween(12, 10)).toEqual({ direction: "up", percent: 20 });
    expect(describeChange(changeBetween(12, 10), "yesterday")).toBe("↑ 20% vs yesterday");
    expect(describeChange(changeBetween(5, 10), "yesterday")).toBe("↓ 50% vs yesterday");
  });

  it("never invents a percentage from zero", () => {
    expect(changeBetween(4, 0)).toEqual({ direction: "up", percent: null });
    expect(describeChange(changeBetween(4, 0), "yesterday")).toBe("↑ vs none yesterday");
  });

  it("says when nothing changed", () => {
    expect(describeChange(changeBetween(0, 0), "the 7 days before")).toBe("Same as the 7 days before");
  });
});

describe("bookings across categories", () => {
  it("adds every category, rentals and stays included", () => {
    expect(
      totalBookings({
        Cleaning: { bookings: 3 },
        "Equipment Rentals": { bookings: 2 },
        "Rooms / PG / Hotels": { bookings: 1 },
      }),
    ).toBe(6);
    expect(totalBookings(undefined)).toBe(0);
  });
});
