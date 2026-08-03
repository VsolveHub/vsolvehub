import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { groupQuote, money, quoteLine, quoteUnit } from "../fixtures";
import { GroupResult } from "./group-result";
import { QuoteReview } from "./quote-review";
import { bookingGroup, checkout, fulfilmentUnit, fulfilmentUnitLine } from "../fixtures";

/**
 * The immutable quote, and the confirmation it leads to.
 *
 * The load-bearing test is the one where the lines deliberately do not add up to
 * the total: a component that recomputed money would agree with itself and
 * disagree with the price being charged.
 */

function renderReview(overrides: Partial<Parameters<typeof QuoteReview>[0]> = {}) {
  const props = {
    quote: groupQuote(),
    visitCount: 1,
    professionalCount: 1,
    isConfirming: false,
    errorMessage: null,
    onConfirm: vi.fn(),
    onBack: vi.fn(),
    onStartOver: vi.fn(),
    ...overrides,
  };
  render(<QuoteReview {...props} />);
  return props;
}

describe("quote units and lines", () => {
  it("renders every unit the server sent, as it grouped them", () => {
    renderReview({
      quote: groupQuote({
        units: [
          quoteUnit({ id: "qu-1", position: 0 }),
          quoteUnit({ id: "qu-2", position: 1, total: money(20000) }),
        ],
      }),
      visitCount: 2,
      professionalCount: 2,
    });

    expect(screen.getByRole("heading", { name: "Visit 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit 2 of 2" })).toBeInTheDocument();
  });

  it("keeps each unit's lines inside that unit rather than pooling them", () => {
    renderReview({
      quote: groupQuote({
        units: [
          quoteUnit({
            id: "qu-1",
            lines: [quoteLine({ id: "l-1", label: "Fan installation" })],
          }),
          quoteUnit({
            id: "qu-2",
            position: 1,
            lines: [quoteLine({ id: "l-2", label: "Geyser repair" })],
          }),
        ],
      }),
      visitCount: 2,
    });

    const first = screen.getByRole("heading", { name: "Visit 1 of 2" }).closest("li")!;
    expect(within(first).getByText("Fan installation")).toBeInTheDocument();
    expect(within(first).queryByText("Geyser repair")).not.toBeInTheDocument();
  });

  it("explains the fee allocation and the per-visit minimum by line kind", () => {
    renderReview({
      quote: groupQuote({
        units: [
          quoteUnit({
            lines: [
              quoteLine({ id: "l-1", kind: "SERVICE" }),
              quoteLine({
                id: "l-2",
                kind: "MINIMUM_VISIT_ADJUSTMENT",
                label: "Minimum visit top-up",
                amount: money(5000),
              }),
              quoteLine({
                id: "l-3",
                kind: "PLATFORM_FEE_ALLOCATION",
                label: "Platform fee",
                amount: money(2000),
              }),
            ],
          }),
        ],
      }),
    });

    expect(screen.getByText("Applies per visit")).toBeInTheDocument();
    expect(
      screen.getByText("This visit's share of the one platform fee"),
    ).toBeInTheDocument();
  });

  it("shows the server total even when the lines do not sum to it", () => {
    // Allocation and rounding make this legitimate. A recomputed total would
    // show ₹300 here and be wrong about what is charged.
    renderReview({
      quote: groupQuote({
        total: money(77777),
        units: [
          quoteUnit({
            total: money(77777),
            lines: [
              quoteLine({ id: "l-1", amount: money(10000) }),
              quoteLine({ id: "l-2", amount: money(20000) }),
            ],
          }),
        ],
      }),
    });

    expect(screen.getAllByText("₹777.77").length).toBeGreaterThan(0);
    expect(screen.queryByText("₹300")).not.toBeInTheDocument();
  });

  it("states the all-or-nothing policy before the confirm action", () => {
    renderReview();
    expect(screen.getByText(/none of it goes ahead and nothing is charged/i)).toBeInTheDocument();
  });
});

describe("a quote that can no longer be used", () => {
  it.each([
    ["EXPIRED", /this price has expired/i],
    ["INVALIDATED", /no longer matches your booking/i],
    ["CONSUMED", /already been used/i],
  ] as const)("says why a %s quote cannot be confirmed", (status, message) => {
    const props = renderReview({ quote: groupQuote({ status }) });

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    // No confirm action at all — a disabled one still reads as "almost there".
    expect(screen.queryByRole("button", { name: /confirm this booking/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /go back to my booking/i }));
    expect(props.onStartOver).toHaveBeenCalledTimes(1);
  });

  it("remains readable rather than becoming a dead end", () => {
    // Historical quotes stay readable by design, so a stale link explains itself.
    renderReview({ quote: groupQuote({ status: "EXPIRED" }) });
    expect(screen.getByText(/nothing has been booked or charged/i)).toBeInTheDocument();
  });
});

describe("confirming", () => {
  it("confirms once and marks the action busy rather than freezing the page", () => {
    const props = renderReview();
    fireEvent.click(screen.getByRole("button", { name: /confirm this booking/i }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);

    renderReview({ isConfirming: true });
    expect(screen.getByRole("button", { name: /confirming/i })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("cannot be double-submitted while a confirmation is in flight", () => {
    // The button blocks activation while busy; the stable idempotency key is the
    // second line of defence, covered in intents.test.ts.
    const props = renderReview({ isConfirming: true });
    const button = screen.getByRole("button", { name: /confirming/i });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("surfaces a refused confirmation instead of appearing to succeed", () => {
    renderReview({ errorMessage: "This quote expired. Review a fresh quote." });
    expect(screen.getByRole("alert")).toHaveTextContent(/expired/i);
  });
});

describe("the confirmed Booking Group", () => {
  it("renders every Fulfilment Unit with its own status, timing and lines", () => {
    render(
      <GroupResult
        checkout={checkout({
          booking_group: bookingGroup({
            status: "MATCHING",
            units: [
              fulfilmentUnit({ id: "fu-1", position: 0, status: "MATCHING" }),
              fulfilmentUnit({
                id: "fu-2",
                position: 1,
                status: "HELD",
                lines: [fulfilmentUnitLine({ id: "ful-2", label: "Geyser repair" })],
              }),
            ],
          }),
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Visit 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visit 2" })).toBeInTheDocument();
    expect(screen.getByText("Finding a professional")).toBeInTheDocument();
    expect(screen.getByText("Professional held")).toBeInTheDocument();
  });

  it("does not claim payment has been taken", () => {
    render(<GroupResult checkout={checkout()} />);
    expect(screen.getByText(/have not been charged/i)).toBeInTheDocument();
  });

  it("says progress continues server-side, and does not claim tracking is impossible", () => {
    // 1.9.0 publishes `GET /booking-groups/{group_id}/`, so "we cannot track
    // this" would be false. What this release lacks is a screen that watches it
    // — FE-09 — so the copy says the statuses shown are from confirmation time
    // and offers no live affordance.
    render(<GroupResult checkout={checkout()} />);

    expect(screen.getByText(/carries on without this page open/i)).toBeInTheDocument();
    expect(screen.getByText(/do not update here yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/not available yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refresh/i })).not.toBeInTheDocument();
  });

  it("tells the customer not to confirm again, which is the duplicate-submit instruction", () => {
    render(<GroupResult checkout={checkout()} />);
    expect(screen.getByText(/do not confirm again/i)).toBeInTheDocument();
  });

  it("refuses to claim success when the response carries no group", () => {
    render(<GroupResult checkout={checkout({ booking_group: null })} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/cannot show it yet/i);
    expect(screen.queryByText(/your booking is confirmed/i)).not.toBeInTheDocument();
  });
});
