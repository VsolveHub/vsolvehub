import { ApiNetworkError } from "@vsolve/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TimelineEventView } from "../adapters";
import { RequestTimeline } from "./request-timeline";

/**
 * `M2-FE-214`.
 *
 * The record both parties read. Two properties matter more than the layout:
 * an event this build does not recognise is still drawn, and an invitation is a
 * number rather than a name.
 *
 * Fixtures live here and nowhere else — execution plan §2.
 */

function event(overrides: Partial<TimelineEventView> = {}): TimelineEventView {
  return {
    id: "e1",
    at: "2026-08-10T09:31:02Z",
    type: "REQUIREMENT_SUBMITTED",
    detail: {},
    ...overrides,
  };
}

function renderTimeline(props: Partial<Parameters<typeof RequestTimeline>[0]> = {}) {
  return render(
    <RequestTimeline events={[event()]} isPending={false} error={null} onRetry={vi.fn()} {...props} />,
  );
}

describe("the record", () => {
  it("is a list, so a reader knows how much came before", () => {
    renderTimeline({
      events: [event(), event({ id: "e2", type: "QUOTE_RECEIVED", at: "2026-08-11T09:00:00Z" })],
    });

    const timeline = screen.getByRole("list", { name: /what has happened/i });
    expect(timeline).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("says nothing has happened rather than showing an empty box", () => {
    renderTimeline({ events: [] });

    expect(screen.getByText(/nothing has happened yet/i)).toBeInTheDocument();
  });

  it("announces itself while loading", () => {
    renderTimeline({ events: [], isPending: true });

    expect(screen.getByText(/loading what has happened/i)).toBeInTheDocument();
  });
});

describe("invitations", () => {
  it("are a count", () => {
    renderTimeline({
      events: [event({ type: "MATCHING_WAVE_SENT", detail: { vendors_invited: 5 } })],
    });

    expect(screen.getByText(/we invited professionals/i)).toBeInTheDocument();
    expect(screen.getByText(/5 professionals invited/i)).toBeInTheDocument();
  });

  it("read correctly when there is only one", () => {
    renderTimeline({
      events: [event({ type: "MATCHING_WAVE_SENT", detail: { vendors_invited: 1 } })],
    });

    expect(screen.getByText(/1 professional invited/i)).toBeInTheDocument();
  });

  it("render the row even when the count is missing", () => {
    // The event happened. Dropping it because one field is absent would put a
    // hole in the record where the matching wave was.
    renderTimeline({ events: [event({ type: "MATCHING_WAVE_SENT", detail: {} })] });

    expect(screen.getByText(/we invited professionals/i)).toBeInTheDocument();
  });
});

describe("an event type this build does not recognise", () => {
  it("is drawn as a neutral dated row rather than dropped", () => {
    // The opposite of the workspace-key rule, and deliberately so: a gap in a
    // record people argue from reads as "nothing happened".
    renderTimeline({ events: [event({ id: "e9", type: null })] });

    expect(screen.getByRole("listitem")).toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
  });
});

describe("questions", () => {
  it("show what was asked, so the Customer can answer it", () => {
    renderTimeline({
      events: [
        event({ type: "QUESTION_ASKED", detail: { body: "Is there a lift to the 4th floor?" } }),
      ],
    });

    expect(screen.getByText(/is there a lift to the 4th floor\?/i)).toBeInTheDocument();
  });
});

describe("when the read fails", () => {
  it("offers a retry when there is nothing on screen", () => {
    const onRetry = vi.fn();
    renderTimeline({ events: [], error: new ApiNetworkError("offline", null), onRetry });

    screen.getByRole("button", { name: /try again/i }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it("keeps the record and says it may be incomplete", () => {
    // Silently showing a partial history in a document people argue from is
    // worse than saying it is partial.
    renderTimeline({ error: new ApiNetworkError("offline", null) });

    expect(screen.getByText(/this may not be up to date/i)).toBeInTheDocument();
    expect(screen.getByText(/you sent this request/i)).toBeInTheDocument();
  });
});
