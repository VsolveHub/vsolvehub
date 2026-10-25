import { describe, expect, it, vi } from "vitest";

// `@` resolves to the Customer app under Vitest; give the card the partner queries it imports.
vi.mock("@/features/rentals/queries", () => ({
  fetchPartnerPickupHours: vi.fn(),
  savePartnerPickupHours: vi.fn(),
}));

const { closedDateLabel, hoursOpenText, rowsFrom, rowsProblem, todayIso, withClosedDate } =
  await import("./pickup-hours-card");

describe("pickup hours form", () => {
  it("starts every day open 9 AM to 9 PM before hours are saved", () => {
    const rows = rowsFrom(undefined);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.open && r.opensAt === "09:00" && r.closesAt === "21:00")).toBe(true);
  });

  it("loads saved hours per day, closed days included", () => {
    const rows = rowsFrom({
      is_set: true,
      summary: "Sat 9 AM-9 PM · Sun 9 AM-6 PM",
      closed_dates: [],
      days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        day_name: "",
        is_open: weekday >= 5,
        opens_at: weekday >= 5 ? "09:00" : null,
        closes_at: weekday === 6 ? "18:00" : weekday === 5 ? "21:00" : null,
      })),
    });
    expect(rows[0]!.open).toBe(false);
    expect(rows[5]).toMatchObject({ open: true, closesAt: "21:00" });
    expect(rows[6]).toMatchObject({ open: true, closesAt: "18:00" });
  });

  it("refuses no open days and a close before the open", () => {
    const closed = rowsFrom(undefined).map((r) => ({ ...r, open: false }));
    expect(rowsProblem(closed)).toBe("Open at least one day.");
    const backwards = rowsFrom(undefined).map((r) =>
      r.weekday === 6 ? { ...r, opensAt: "18:00", closesAt: "09:00" } : r,
    );
    expect(rowsProblem(backwards)).toBe("On Sunday, closing time must be after opening time.");
    expect(rowsProblem(rowsFrom(undefined))).toBeNull();
  });

  it("says how long a day is open", () => {
    expect(hoursOpenText("09:00", "21:00")).toBe("12 hr");
    expect(hoursOpenText("09:00", "18:30")).toBe("9 hr 30 min");
    expect(hoursOpenText("18:00", "09:00")).toBe("");
  });
});

describe("days off", () => {
  const today = "2026-10-25";

  it("keeps them sorted and without repeats", () => {
    const once = withClosedDate(["2026-11-14"], "2026-10-31", today);
    expect(once).toEqual(["2026-10-31", "2026-11-14"]);
    expect(withClosedDate(once, "2026-10-31", today)).toEqual(once);
  });

  it("does not add a day already past, or nothing at all", () => {
    expect(withClosedDate([], "2026-10-24", today)).toEqual([]);
    expect(withClosedDate([], "", today)).toEqual([]);
    expect(withClosedDate([], today, today)).toEqual([today]);
  });

  it("reads a date as the calendar day it names", () => {
    // Midnight UTC would be the previous day in a timezone west of Greenwich.
    expect(closedDateLabel("2026-10-31")).toContain("31");
    expect(todayIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
