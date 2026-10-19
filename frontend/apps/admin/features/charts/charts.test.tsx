import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarList } from "./bar-list";
import { DonutChart } from "./donut-chart";
import { bucketLabel, compactRupees, statusLabel } from "./theme";
import { TrendChart } from "./trend-chart";

describe("chart number formats", () => {
  it("compacts rupees the Indian way", () => {
    expect(compactRupees(95_000)).toBe("₹950");
    expect(compactRupees(1_200_000)).toBe("₹12k");
    expect(compactRupees(34_000_000)).toBe("₹3.4L");
    expect(compactRupees(1_200_000_000)).toBe("₹1.2Cr");
  });

  it("reads a bucket as a calendar date, not a UTC instant", () => {
    expect(bucketLabel("2026-10-07", "day")).toBe("7 Oct");
    expect(bucketLabel("2026-10-05", "week")).toBe("w/c 5 Oct");
    expect(bucketLabel("2026-10-05", "week", true)).toBe("Week of 5 Oct 2026");
  });

  it("turns status codes into words", () => {
    expect(statusLabel("CHANGES_REQUIRED")).toBe("Changes required");
  });
});

describe("BarList", () => {
  it("ranks rows largest first and prints every value", () => {
    render(
      <BarList
        rows={[
          { key: "a", label: "Cleaning", value: 10 },
          { key: "b", label: "Rentals", value: 30, detail: "4 bookings", href: "/operations/rentals" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Rentals");
    expect(items[0]).toHaveTextContent("4 bookings");
    expect(within(items[0]!).getByRole("link", { name: "Rentals" })).toHaveAttribute(
      "href",
      "/operations/rentals",
    );
    expect(items[1]).toHaveTextContent("Cleaning");
  });

  it("keeps a pipeline in its own order when sorting is off", () => {
    render(
      <BarList
        sort={false}
        rows={[
          { key: "SUBMITTED", label: "Submitted", value: 1 },
          { key: "APPROVED", label: "Approved", value: 9 },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Submitted");
  });

  it("says so when everything is zero instead of drawing empty bars", () => {
    render(<BarList rows={[{ key: "a", label: "A", value: 0 }]} emptyText="Nothing waiting." />);
    expect(screen.getByText("Nothing waiting.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});

describe("DonutChart", () => {
  it("labels every slice with its count and share", () => {
    render(
      <DonutChart
        title="Outcomes"
        totalLabel="bookings"
        slices={[
          { key: "done", label: "Completed", value: 3, color: "#000" },
          { key: "lost", label: "Cancelled", value: 1, color: "#111" },
        ]}
      />,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    const completed = screen.getByText("Completed").closest("li")!;
    expect(completed).toHaveTextContent("75%");
    expect(screen.getByRole("img")).toHaveAccessibleName(/Completed: 3 \(75%\)/);
  });

  it("shows an empty state rather than an empty ring", () => {
    render(
      <DonutChart
        title="Outcomes"
        totalLabel="bookings"
        slices={[{ key: "done", label: "Completed", value: 0, color: "#000" }]}
      />,
    );
    expect(screen.getByText("Nothing in this period yet.")).toBeInTheDocument();
  });
});

describe("TrendChart", () => {
  const series = [
    { key: "collected_gmv_paise", label: "Collected GMV", color: "#d65e00" },
    { key: "refunds_paise", label: "Refunded", color: "#2551a3" },
  ];

  it("prints the period totals in rupees above the plot", () => {
    render(
      <TrendChart
        title="Money collected"
        subtitle="Per day, last 30 days"
        granularity="day"
        money
        variant="area"
        series={series}
        data={[
          { date: "2026-10-01", collected_gmv_paise: 100_000, refunds_paise: 0 },
          { date: "2026-10-02", collected_gmv_paise: 250_000, refunds_paise: 50_000 },
        ]}
      />,
    );
    expect(screen.getByText("₹3,500")).toBeInTheDocument();
    expect(screen.getByText("₹500")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(/Collected GMV: ₹3,500 in total/);
  });

  it("shows an empty state when the whole period is zero", () => {
    render(
      <TrendChart
        title="New signups"
        subtitle="Per day, last 30 days"
        granularity="day"
        variant="bar"
        series={[{ key: "new_signups", label: "Signups", color: "#d65e00" }]}
        data={[{ date: "2026-10-01", new_signups: 0 }]}
      />,
    );
    expect(screen.getByText("Nothing in this period yet.")).toBeInTheDocument();
  });
});
