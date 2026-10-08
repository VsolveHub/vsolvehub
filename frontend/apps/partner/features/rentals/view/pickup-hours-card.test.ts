import { describe, expect, it, vi } from "vitest";

// `@` resolves to the Customer app under Vitest; give the card the partner queries it imports.
vi.mock("@/features/rentals/queries", () => ({
  fetchPartnerPickupHours: vi.fn(),
  savePartnerPickupHours: vi.fn(),
}));

const { TIME_CHOICES, rowsFrom, rowsProblem, timeLabel } = await import("./pickup-hours-card");

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

  it("offers half-hour steps from 5 AM to 11:30 PM", () => {
    expect(TIME_CHOICES[0]).toBe("05:00");
    expect(TIME_CHOICES.at(-1)).toBe("23:30");
    expect(TIME_CHOICES).toContain("09:00");
    expect(TIME_CHOICES).toContain("21:00");
    expect(timeLabel("21:00")).toBe("9 PM");
    expect(timeLabel("09:30")).toBe("9:30 AM");
  });
});
