import { ApiNetworkError } from "@vsolve/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RequestRowView, TimelineEventView } from "../adapters";
import { RequestDetail } from "./request-detail";

/**
 * One request's page.
 *
 * The property worth a test is the split: the header and the record fail
 * separately, so a timeline that will not load cannot hide the fact that the
 * request closed and the Customer is owed a refund.
 *
 * Fixtures live here and nowhere else — execution plan §2.
 */

function request(overrides: Partial<RequestRowView> = {}): RequestRowView {
  return {
    id: "req-1",
    title: "Housekeeping staff",
    status: "CLOSED_SLA_BREACH",
    deadlineAt: null,
    serviceBy: "2026-08-24",
    teaserCount: 0,
    closure: "SLA_BREACH",
    lastActivityAt: null,
    lifecycleExplanation: "You are hiring people for a period of time.",
    ...overrides,
  };
}

const SUBMITTED: TimelineEventView = {
  id: "e1",
  at: "2026-08-10T09:31:02Z",
  type: "REQUIREMENT_SUBMITTED",
  detail: {},
};

function renderDetail(props: Partial<Parameters<typeof RequestDetail>[0]> = {}) {
  return render(
    <RequestDetail
      request={request()}
      isRequestPending={false}
      requestError={null}
      events={[SUBMITTED]}
      isTimelinePending={false}
      timelineError={null}
      onRetryRequest={vi.fn()}
      onRetryTimeline={vi.fn()}
      {...props}
    />,
  );
}

describe("the two reads fail independently", () => {
  it("still states the closure when the timeline will not load", () => {
    renderDetail({ events: [], timelineError: new ApiNetworkError("offline", null) });

    expect(screen.getByText(/we missed our deadline/i)).toBeInTheDocument();
    expect(screen.getByText(/refunded in full/i)).toBeInTheDocument();
  });

  it("still shows the record when the request header will not load", () => {
    renderDetail({ request: null, requestError: new ApiNetworkError("offline", null) });

    expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
    expect(screen.getByText(/you sent this request/i)).toBeInTheDocument();
  });

  it("does not present a loading header as a missing request", () => {
    renderDetail({ request: null, isRequestPending: true });

    expect(screen.getByText(/loading this request/i)).toBeInTheDocument();
    expect(screen.queryByText(/connection lost/i)).not.toBeInTheDocument();
  });
});

describe("the header", () => {
  it("offers support on a closure that is our fault", () => {
    renderDetail({ supportAction: <button type="button">Talk to us</button> });

    expect(screen.getByRole("button", { name: /talk to us/i })).toBeInTheDocument();
  });

  it("withholds support on a closure that is not", () => {
    renderDetail({
      request: request({ status: "CLOSED_NO_SUPPLY", closure: "NO_SUPPLY" }),
      supportAction: <button type="button">Talk to us</button>,
    });

    expect(screen.queryByRole("button", { name: /talk to us/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nobody available/i)).toBeInTheDocument();
  });

  it("counts quotes without naming who sent them", () => {
    renderDetail({
      request: request({ status: "QUOTES_READY", closure: null, teaserCount: 2 }),
    });

    expect(screen.getByText(/2 quotes waiting/i)).toBeInTheDocument();
  });
});
