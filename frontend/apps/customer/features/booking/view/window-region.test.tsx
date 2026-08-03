import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { windowsViewFixture } from "../adapters/view-fixtures";
import { WindowRegion, type WindowAvailability } from "./window-region";
import { WorkspaceProvider } from "./workspace-context";

/**
 * Four answers, four different screens.
 *
 * The `unpublished` state these tests used to cover is gone: contract 1.6.0
 * published the operation, so the step calls it. What remains is the distinction
 * that still matters — a failed search and an empty one must never look alike,
 * because "we could not load arrival windows" reads to a customer as "there is
 * nothing available".
 */

function renderRegion(availability: WindowAvailability) {
  render(
    <WorkspaceProvider serviceSlug="fan-installation">
      <WindowRegion availability={availability} />
    </WorkspaceProvider>,
  );
}

describe("while the search is running", () => {
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

describe("when the search fails", () => {
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

describe("an empty result", () => {
  it("says every window is taken, not that something failed", () => {
    // The distinction the whole component exists for. An empty answer is the
    // server telling the truth; a failure is us being unable to ask.
    renderRegion({
      status: "ready",
      windows: {
        days: [],
        estimatedDurationMinutes: 60,
        isEmpty: true,
        isPreliminary: false,
      },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/no arrival windows available/i)).toBeInTheDocument();
  });
});
