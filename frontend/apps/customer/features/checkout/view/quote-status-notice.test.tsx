import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { groupQuote } from "../fixtures";
import { QuoteStatusNotice } from "./quote-status-notice";

/**
 * Carried over from the retired `QuoteReview`: the wording that explains why a
 * price stopped applying. The screen changed shape; these guarantees did not.
 */

describe("while the price still applies", () => {
  it("says nothing at all", () => {
    const { container } = render(
      <QuoteStatusNotice quote={groupQuote({ status: "ACTIVE" })} onStartOver={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("when the price stopped applying", () => {
  it.each([
    ["EXPIRED", /this price has expired/i],
    ["INVALIDATED", /no longer matches your booking/i],
    ["CONSUMED", /already been used/i],
  ] as const)("names the reason for %s", (status, title) => {
    render(<QuoteStatusNotice quote={groupQuote({ status })} onStartOver={vi.fn()} />);

    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it.each(["EXPIRED", "INVALIDATED"] as const)(
    "answers the money question first for %s",
    (status) => {
      render(<QuoteStatusNotice quote={groupQuote({ status })} onStartOver={vi.fn()} />);

      expect(screen.getByText(/nothing has been booked or charged/i)).toBeInTheDocument();
    },
  );

  it("offers a way forward rather than a dead end", () => {
    const onStartOver = vi.fn();
    render(<QuoteStatusNotice quote={groupQuote({ status: "EXPIRED" })} onStartOver={onStartOver} />);

    fireEvent.click(screen.getByRole("button", { name: /work out a fresh price/i }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});
