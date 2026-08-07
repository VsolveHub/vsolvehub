import { describe, expect, it } from "vitest";

import { toDailyEarnings } from "./earnings-chart";

/**
 * The chart used to group the ledger in the browser. The client holds one page, so a Partner
 * with more entries than fit in a page had the rest silently dropped and saw a quieter week
 * than they actually worked. The series is the server's now, and this adapter must stay an
 * adapter — labelling only, no arithmetic.
 */
describe("toDailyEarnings", () => {
  const series = [
    { date: "2026-08-03", net_paise: 0, jobs: 0 },
    { date: "2026-08-04", net_paise: 26896, jobs: 1 },
    { date: "2026-08-05", net_paise: 53792, jobs: 2 },
  ];

  it("passes the server's amounts through untouched", () => {
    const days = toDailyEarnings(series);

    expect(days.map((day) => day.netPaise)).toEqual([0, 26896, 53792]);
  });

  it("keeps every day the server sent, including the empty ones", () => {
    // A gap that closed up would make a day off look like it never happened.
    const days = toDailyEarnings(series);

    expect(days).toHaveLength(series.length);
    expect(days.map((day) => day.date)).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("labels each column with its own weekday", () => {
    // Parsed at local noon: a YYYY-MM-DD read as midnight UTC lands on the previous evening
    // west of Greenwich and would label every column with the wrong day.
    const days = toDailyEarnings([{ date: "2026-08-04", net_paise: 0, jobs: 0 }]);

    expect(days[0]!.label).toBe(
      new Date("2026-08-04T12:00:00").toLocaleDateString(undefined, { weekday: "short" }),
    );
  });

  it("renders nothing rather than inventing columns for an empty series", () => {
    expect(toDailyEarnings([])).toEqual([]);
  });
});
