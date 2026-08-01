import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { windowsViewFixture } from "../adapters/view-fixtures";
import { WindowRegion, type WindowAvailability } from "./window-region";
import { WorkspaceProvider } from "./workspace-context";

/**
 * Five answers, five different screens.
 *
 * The one that matters most today is `unpublished`. Django serves no arrival
 * windows yet, so the honest screen is "this step is not open", not a request
 * that can only fail — and certainly not the failure copy, which a customer
 * reads as "there is no availability".
 */

function renderRegion(availability: WindowAvailability) {
  render(
    <WorkspaceProvider serviceSlug="fan-installation">
      <WindowRegion availability={availability} />
    </WorkspaceProvider>,
  );
}

describe("before the endpoint is published", () => {
  it("says the step is not open rather than claiming a failure", () => {
    renderRegion({ status: "unpublished" });

    expect(screen.getByRole("status")).toHaveTextContent(/not open yet/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never implies there is no availability", () => {
    // The specific misreading: "we could not load arrival windows" and "every
    // window is taken" look identical to someone deciding whether to book here.
    renderRegion({ status: "unpublished" });
    const copy = screen.getByRole("status").textContent ?? "";

    expect(copy).not.toMatch(/no windows|none available|fully booked|could not load/i);
  });

  it("confirms nothing was booked and nothing was lost", () => {
    renderRegion({ status: "unpublished" });
    const copy = screen.getByRole("status").textContent ?? "";

    expect(copy).toMatch(/nothing has been booked/i);
    expect(copy).toMatch(/not been charged/i);
    expect(copy).toMatch(/saved/i);
  });

  it("offers no control that would send a request", () => {
    renderRegion({ status: "unpublished" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});

describe("while a published search is running", () => {
  it("announces loading once rather than leaving a screen reader in silence", () => {
    renderRegion({ status: "loading" });

    const region = screen.getByText("Loading available arrival windows").parentElement;
    expect(region).toHaveAttribute("aria-busy", "true");
  });

  it("shows a placeholder rather than the picker", () => {
    renderRegion({ status: "loading" });
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});

describe("when a published search fails", () => {
  it("says so instead of loading for ever", () => {
    renderRegion({ status: "error", onRetry: vi.fn() });

    expect(screen.getByRole("alert")).toHaveTextContent(/could not load arrival windows/i);
    expect(screen.queryByText(/loading available arrival windows/i)).not.toBeInTheDocument();
  });

  it("states that nothing was booked, and offers the retry", () => {
    const onRetry = vi.fn();
    renderRegion({ status: "error", onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent(/nothing has been booked/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("when windows arrive", () => {
  it("hands over to the stage and stops announcing loading", () => {
    renderRegion({ status: "ready", windows: windowsViewFixture() });

    expect(screen.getByRole("radiogroup", { name: /choose a date/i })).toBeInTheDocument();
    expect(screen.queryByText(/loading available arrival windows/i)).not.toBeInTheDocument();
  });
});
