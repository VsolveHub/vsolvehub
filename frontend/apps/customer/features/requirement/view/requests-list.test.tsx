import { ApiNetworkError, ApiRequestError } from "@vsolve/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RequestRowView } from "../adapters";
import { RequestsList } from "./requests-list";

/**
 * `M2-FE-213` and `M2-FE-215`.
 *
 * Three properties, and all three are about not saying something untrue to
 * somebody who is waiting:
 *
 * 1. A request whose promised deadline has passed does not read as on track.
 * 2. It also does not read as SLA-breached, which is a server transition with a
 *    refund attached.
 * 3. No quote's author is named before unlock, on any state.
 *
 * Fixtures live here and nowhere else — execution plan §2.
 */

/** Relative to the real clock, because `serverClock` falls back to it uncalibrated. */
const IN_TWO_HOURS = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

function row(overrides: Partial<RequestRowView> = {}): RequestRowView {
  return {
    id: "req-1",
    title: "Housekeeping staff",
    status: "MATCHING",
    deadlineAt: IN_TWO_HOURS,
    serviceBy: "2026-08-24",
    teaserCount: 0,
    closure: null,
    lastActivityAt: null,
    lifecycleExplanation: "You are hiring people for a period of time.",
    ...overrides,
  };
}

function renderList(props: Partial<Parameters<typeof RequestsList>[0]> = {}) {
  return render(
    <RequestsList
      requests={[row()]}
      isPending={false}
      error={null}
      onRetry={vi.fn()}
      hrefFor={(id) => `/requests/${id}`}
      {...props}
    />,
  );
}

describe("while the list is loading", () => {
  it("says so rather than showing an empty list", () => {
    renderList({ isPending: true, requests: [] });

    expect(screen.getByText(/loading your requests/i)).toBeInTheDocument();
    expect(screen.queryByText(/you have not asked for anything yet/i)).not.toBeInTheDocument();
  });
});

describe("when there is nothing", () => {
  it("says what would put something here, and that it costs nothing", () => {
    renderList({ requests: [] });

    expect(screen.getByText(/you have not asked for anything yet/i)).toBeInTheDocument();
    expect(screen.getByText(/describing one is free/i)).toBeInTheDocument();
  });
});

describe("when the read fails", () => {
  it("offers a retry for a lost connection and says nothing was submitted", () => {
    const onRetry = vi.fn();
    renderList({ requests: [], error: new ApiNetworkError("offline", null), onRetry });

    expect(screen.getByText(/connection lost/i)).toBeInTheDocument();
    screen.getByRole("button", { name: /try again/i }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it("fails closed on a refusal instead of offering a retry that cannot work", () => {
    renderList({
      requests: [],
      error: new ApiRequestError(403, {
        code: "permission_denied",
        message: "You do not have access to this.",
        details: null,
        retryable: false,
        request_id: null,
      }),
    });

    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("keeps rows already on screen and marks them as possibly stale", () => {
    // A stale list is more useful than a blank page — as long as it says it is
    // stale.
    renderList({ error: new ApiNetworkError("offline", null) });

    expect(screen.getByText(/this list may be out of date/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /housekeeping staff/i })).toBeInTheDocument();
  });
});

describe("a request that is still matching", () => {
  it("says what we are doing and how long we promised", () => {
    renderList();

    expect(screen.getByText(/finding professionals/i)).toBeInTheDocument();
    expect(screen.getByText(/quotes promised in/i)).toBeInTheDocument();
  });

  it("claims no progress it cannot see", () => {
    renderList();

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/reviewing/i)).not.toBeInTheDocument();
  });
});

describe("a request whose promised deadline has passed", () => {
  it("says we are late rather than that we are on track", () => {
    renderList({ requests: [row({ deadlineAt: TWO_HOURS_AGO })] });

    expect(screen.getByText(/running late/i)).toBeInTheDocument();
    expect(screen.getByText(/we said you would have quotes by now/i)).toBeInTheDocument();
  });

  it("does not claim a breach, a closure or a refund", () => {
    // All three are server decisions. A countdown reaching zero authorises none
    // of them.
    renderList({ requests: [row({ deadlineAt: TWO_HOURS_AGO })] });

    expect(screen.queryByText(/refund/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/closed/i)).not.toBeInTheDocument();
    expect(screen.getByText(/nothing has been decided/i)).toBeInTheDocument();
  });

  it("stops counting down once the promise is gone", () => {
    renderList({ requests: [row({ deadlineAt: TWO_HOURS_AGO })] });

    expect(screen.queryByText(/quotes promised in/i)).not.toBeInTheDocument();
  });
});

describe("the closed states read differently", () => {
  it("separates 'nobody covers this' from 'we ran out of time'", () => {
    renderList({
      requests: [
        row({ id: "a", status: "CLOSED_NO_SUPPLY", closure: "NO_SUPPLY", deadlineAt: null }),
        row({ id: "b", status: "CLOSED_SLA_BREACH", closure: "SLA_BREACH", deadlineAt: null }),
      ],
    });

    expect(screen.getByText(/nobody available/i)).toBeInTheDocument();
    expect(screen.getByText(/we invited every professional/i)).toBeInTheDocument();
    expect(screen.getByText(/we missed our deadline/i)).toBeInTheDocument();
    expect(screen.getByText(/refunded in full/i)).toBeInTheDocument();
  });

  it("explains an expired request in terms of the date the Customer chose", () => {
    renderList({
      requests: [row({ status: "CLOSED_EXPIRED", closure: "EXPIRED", deadlineAt: null })],
    });

    expect(screen.getByText(/your date has passed/i)).toBeInTheDocument();
    expect(screen.getByText(/start again with a new date/i)).toBeInTheDocument();
  });

  it("never presents a chosen-but-unconfirmed professional as a booking", () => {
    renderList({ requests: [row({ status: "SELECTED", deadlineAt: null })] });

    expect(screen.getByText(/this is not a booking until they do/i)).toBeInTheDocument();
  });
});

describe("the pre-unlock identity rule", () => {
  it("counts the quotes and names nobody", () => {
    renderList({ requests: [row({ status: "QUOTES_READY", teaserCount: 3, deadlineAt: null })] });

    expect(screen.getByText(/3 quotes waiting/i)).toBeInTheDocument();
    // The row renders only what the adapter gave it, and the adapter carries no
    // vendor field at all. This is the assertion that notices if one is added.
    expect(screen.queryByText(/sent by/i)).not.toBeInTheDocument();
  });
});

describe("the support action", () => {
  it("is offered where we are the reason there is nothing to show", () => {
    renderList({
      requests: [row({ status: "CLOSED_SLA_BREACH", closure: "SLA_BREACH", deadlineAt: null })],
      supportActionFor: () => <button type="button">Talk to us</button>,
    });

    expect(screen.getByRole("button", { name: /talk to us/i })).toBeInTheDocument();
  });

  it("is not offered on a request that is simply still running", () => {
    // Attaching it everywhere trains people to ignore it on the one state that
    // needs it.
    renderList({ supportActionFor: () => <button type="button">Talk to us</button> });

    expect(screen.queryByRole("button", { name: /talk to us/i })).not.toBeInTheDocument();
  });
});
