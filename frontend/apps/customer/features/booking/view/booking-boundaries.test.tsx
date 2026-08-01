import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BookingRouteError } from "./booking-error-boundary";
import { BookingLoading } from "./booking-loading";
import { BookingNotFound } from "./booking-not-found";

describe("booking route boundaries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("announces the booking workspace loading state with a shape-matched shell", () => {
    const { container } = render(<BookingLoading />);

    expect(screen.getByText("Loading booking workspace")).toHaveClass("sr-only");
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThan(6);
  });

  it("sends unavailable booking URLs back to the live catalogue", () => {
    render(<BookingNotFound />);

    expect(
      screen.getByRole("heading", { name: /we cannot book that service right now/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse live services/i })).toHaveAttribute(
      "href",
      "/catalog",
    );
  });

  it("lets customers retry a failed booking step without implying state changed", () => {
    const reset = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("API unavailable") as Error & { digest?: string };
    error.digest = "req_123";

    render(<BookingRouteError error={error} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nothing was booked, charged, assigned or submitted",
    );
    expect(screen.getByText(/Reference:/)).toHaveTextContent("req_123");

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[booking-error-boundary]", "req_123", error);
  });
});
