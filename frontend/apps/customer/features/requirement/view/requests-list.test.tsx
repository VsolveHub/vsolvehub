import { ApiNetworkError, ApiRequestError } from "@vsolve/api-client";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/catalog/components/catalog-service-thumb", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/catalog/components/catalog-service-thumb")>();
  return {
    ...actual,
    CatalogServiceThumb: () => null,
    CatalogServiceThumbRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  };
});

import type { RequestRowView } from "../adapters";
import { RequestsList } from "./requests-list";

/**
 * `M2-FE-213` and `M2-FE-215`.
 *
 * The list row is compact: service name, status badge, and one line of when or
 * what to do. Essays and next-step footers live on the detail screen.
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
    categorySlug: "housekeeping-staff",
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
    renderList({ error: new ApiNetworkError("offline", null) });

    expect(screen.getByText(/this list may be out of date/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /housekeeping staff/i })).toBeInTheDocument();
  });
});

describe("a request that is still matching", () => {
  it("shows the status badge and the quote promise on one line", () => {
    renderList();

    expect(screen.getByText(/finding professionals/i)).toBeInTheDocument();
    expect(screen.getByText(/quotes promised in/i)).toBeInTheDocument();
    expect(screen.queryByText(/we are inviting professionals/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/last update/i)).not.toBeInTheDocument();
  });

  it("claims no progress it cannot see", () => {
    renderList();

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/reviewing/i)).not.toBeInTheDocument();
  });
});

describe("a request whose promised deadline has passed", () => {
  it("shows the delayed badge without the full explanation essay", () => {
    renderList({ requests: [row({ deadlineAt: TWO_HOURS_AGO })] });

    expect(screen.getByText(/running late/i)).toBeInTheDocument();
    expect(screen.queryByText(/we said you would have quotes by now/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing has been decided/i)).not.toBeInTheDocument();
  });

  it("stops counting down once the promise is gone", () => {
    renderList({ requests: [row({ deadlineAt: TWO_HOURS_AGO })] });

    expect(screen.queryByText(/quotes promised in/i)).not.toBeInTheDocument();
  });
});

describe("the closed states read differently on the badge", () => {
  it("separates 'nobody covers this' from 'we ran out of time' by label", () => {
    renderList({
      requests: [
        row({ id: "a", status: "CLOSED_NO_SUPPLY", closure: "NO_SUPPLY", deadlineAt: null }),
        row({ id: "b", status: "CLOSED_SLA_BREACH", closure: "SLA_BREACH", deadlineAt: null }),
      ],
    });

    expect(screen.getByText(/nobody available/i)).toBeInTheDocument();
    expect(screen.getByText(/we missed our deadline/i)).toBeInTheDocument();
    expect(screen.queryByText(/we invited every professional/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/refunded in full/i)).not.toBeInTheDocument();
  });

  it("shows the expired badge without the detail-screen next step", () => {
    renderList({
      requests: [row({ status: "CLOSED_EXPIRED", closure: "EXPIRED", deadlineAt: null })],
    });

    expect(screen.getByText(/your date has passed/i)).toBeInTheDocument();
    expect(screen.queryByText(/start again with a new date/i)).not.toBeInTheDocument();
  });

  it("shows waiting-for-confirmation on the badge only", () => {
    renderList({ requests: [row({ status: "SELECTED", deadlineAt: null })] });

    expect(screen.getByText(/waiting for the professional/i)).toBeInTheDocument();
    expect(screen.queryByText(/this is not a booking until they do/i)).not.toBeInTheDocument();
  });
});

describe("the pre-unlock identity rule", () => {
  it("counts the quotes and names nobody", () => {
    renderList({ requests: [row({ status: "QUOTES_READY", teaserCount: 3, deadlineAt: null })] });

    expect(screen.getByText(/3 quotes waiting/i)).toBeInTheDocument();
    expect(screen.queryByText(/sent by/i)).not.toBeInTheDocument();
  });
});
