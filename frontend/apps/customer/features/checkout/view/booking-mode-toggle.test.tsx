import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookingModeToggle } from "./booking-mode-toggle";

describe("BookingModeToggle", () => {
  it("renders both modes and shows instant as available with ETA badge", () => {
    const onChange = vi.fn();
    render(
      <BookingModeToggle
        value="SCHEDULED"
        onChange={onChange}
        instant={{
          isAvailable: true,
          earliestStartsAt: "2026-08-10T10:45:00Z",
          etaMinutes: 35,
          unavailableReason: null,
        }}
      />,
    );

    const instantBtn = screen.getByRole("radio", { name: /instant \/ asap/i });
    const scheduledBtn = screen.getByRole("radio", { name: /schedule for later/i });

    expect(instantBtn).not.toBeDisabled();
    expect(scheduledBtn).not.toBeDisabled();
    expect(screen.getByText("~35m")).toBeInTheDocument();
  });

  it("calls onChange when clicking Instant mode", () => {
    const onChange = vi.fn();
    render(
      <BookingModeToggle
        value="SCHEDULED"
        onChange={onChange}
        instant={{
          isAvailable: true,
          earliestStartsAt: "2026-08-10T10:45:00Z",
          etaMinutes: 35,
          unavailableReason: null,
        }}
      />,
    );

    const instantBtn = screen.getByRole("radio", { name: /instant \/ asap/i });
    fireEvent.click(instantBtn);
    expect(onChange).toHaveBeenCalledWith("INSTANT");
  });

  it("disables Instant mode and shows unavailable reason when unavailable", () => {
    const onChange = vi.fn();
    render(
      <BookingModeToggle
        value="SCHEDULED"
        onChange={onChange}
        instant={{
          isAvailable: false,
          earliestStartsAt: null,
          etaMinutes: null,
          unavailableReason: "NO_ONLINE_PARTNERS",
        }}
      />,
    );

    const instantBtn = screen.getByRole("radio", { name: /instant \/ asap/i });
    expect(instantBtn).toBeDisabled();
    expect(
      screen.getByText(/no professionals currently online\. schedule for later instead\./i),
    ).toBeInTheDocument();
  });

  it("calls onChange when switching back to Scheduled mode", () => {
    const onChange = vi.fn();
    render(
      <BookingModeToggle
        value="INSTANT"
        onChange={onChange}
        instant={{
          isAvailable: true,
          earliestStartsAt: "2026-08-10T10:45:00Z",
          etaMinutes: 30,
          unavailableReason: null,
        }}
      />,
    );

    const scheduledBtn = screen.getByRole("radio", { name: /schedule for later/i });
    fireEvent.click(scheduledBtn);
    expect(onChange).toHaveBeenCalledWith("SCHEDULED");
  });
});
