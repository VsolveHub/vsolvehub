import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CoveragePage } from "./coverage-page";

const TREND = [null, null, null, null, null, null, null, null, 1, 1, 2, 2];

vi.mock("../queries", () => ({
  useCoverageLite: () => ({
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    data: {
      summary: {
        total_areas: 1,
        total_zones: 1,
        total_pins: 1,
        total_partners: 2,
        total_open_asked_pins: 1,
        total_bookings_28d: 9,
        total_offer_expiries_28d: 4,
        total_turned_away_28d: 12,
        red_areas: 1,
        amber_areas: 0,
        green_areas: 0,
        trend_weeks: [],
        trend: TREND,
      },
      areas: [
        {
          id: "a1",
          name: "Gachibowli",
          slug: "gachibowli",
          zone: "West",
          is_active: true,
          is_accepting_partners: true,
          postal_codes: ["500032"],
          partner_counts: { APPROVED: 2 },
          partner_trades: { Electrician: 2 },
          open_asked_pins_count: 1,
          bookings_28d_count: 9,
          offer_expiries_28d_count: 4,
          approved_partners: 2,
          target_partners: 10,
          alert_below: null,
          flag: "RED",
          trade_targets: [
            {
              skill_code: "electrician",
              skill_name: "Electrician",
              target_partners: 4,
              alert_below: null,
              approved_partners: 2,
              flag: "AMBER",
            },
          ],
          turned_away_28d_count: 12,
          trend: TREND,
        },
      ],
    },
  }),
}));

describe("Coverage", () => {
  it("flags an area short of its target, with the bars, demand and trend", () => {
    render(<CoveragePage />);
    expect(screen.getAllByText("Short").length).toBeGreaterThan(0);
    expect(screen.getByTitle("2 of 10 approved partners")).toBeInTheDocument();
    expect(screen.getByTitle("2 of 4 approved partners")).toBeInTheDocument();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("img", { name: /Approved partners over 12 weeks/ }).length,
    ).toBeGreaterThan(0);
  });

  it("offers the recruitment list next to the export", () => {
    render(<CoveragePage />);
    expect(screen.getByRole("button", { name: /Recruitment list/ })).toBeInTheDocument();
  });
});
