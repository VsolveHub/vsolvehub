import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BookingStatusTabs } from "./booking-status-tabs";

describe("BookingStatusTabs", () => {
  it("shows live counts and marks the selected tab", () => {
    render(
      <BookingStatusTabs selected="active" counts={{ active: 2, past: 1, cancelled: 0 }} />,
    );

    expect(screen.getByRole("tab", { name: "Upcoming & Active 2" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Past 1" })).toHaveAttribute("href", "/activity?status=past");
    expect(screen.getByRole("tab", { name: "Cancelled 0" })).toHaveAttribute(
      "href",
      "/activity?status=cancelled",
    );
  });
});
