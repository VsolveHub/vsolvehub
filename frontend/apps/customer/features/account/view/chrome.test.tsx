import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountNote, AccountSection, Moment } from "./chrome";

/**
 * The account area's shared furniture.
 *
 * `Moment` is small and load-bearing: every row on every account screen carries a
 * server timestamp through it, and the branch worth testing is the one nobody
 * exercises by hand. A `null` `completed_at`, an `withdrawn_at` that was never
 * set, a field a newer deployment sends empty — all reach this component, and
 * "Invalid Date" in front of a customer is the sort of thing that ships because
 * only the happy path was tried.
 *
 * The ISO instant staying in the markup matters separately: the visible text is
 * localised to the reader's zone, so `dateTime` is the only unambiguous value on
 * the page for assistive technology and anything parsing it.
 */

describe("Moment", () => {
  it("renders the server instant in the markup and a local reading on screen", () => {
    render(<Moment value="2026-08-05T09:30:00Z" />);

    const time = screen.getByRole("time");
    expect(time).toHaveAttribute("datetime", "2026-08-05T09:30:00Z");
    expect(time.textContent).not.toBe("");
    expect(time.textContent).not.toMatch(/invalid/i);
  });

  it("renders nothing at all for an absent timestamp", () => {
    // `completed_at` is null until a privacy request finishes, and
    // `withdrawn_at` until a consent is withdrawn. Both reach here.
    const { container } = render(
      <>
        <Moment value={null} />
        <Moment value={undefined} />
        <Moment value="" />
      </>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing rather than 'Invalid Date' for something unparseable", () => {
    const { container } = render(<Moment value="not-a-date" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("drops the time when only the date is meaningful", () => {
    // "Already asked for on 5 Aug 2026" — an hour and minute there would imply a
    // precision the sentence does not want.
    render(<Moment value="2026-08-05T09:30:00Z" dateOnly />);

    expect(screen.getByRole("time").textContent ?? "").not.toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("AccountSection", () => {
  it("names the record and says what it is for", () => {
    render(
      <AccountSection title="Your addresses" description="Where we send people.">
        <p>Rows</p>
      </AccountSection>,
    );

    expect(screen.getByRole("heading", { name: "Your addresses" })).toBeInTheDocument();
    expect(screen.getByText("Where we send people.")).toBeInTheDocument();
    expect(screen.getByText("Rows")).toBeInTheDocument();
  });

  it("renders an action only when one is given", () => {
    const { rerender } = render(
      <AccountSection title="Your addresses" description="Where we send people.">
        <p>Rows</p>
      </AccountSection>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <AccountSection
        title="Your addresses"
        description="Where we send people."
        action={<button type="button">Add</button>}
      >
        <p>Rows</p>
      </AccountSection>,
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});

describe("AccountNote", () => {
  it("states a product limit rather than leaving a panel looking broken", () => {
    render(<AccountNote>Your consent record is held on our side.</AccountNote>);

    expect(screen.getByText(/held on our side/i)).toBeInTheDocument();
  });
});
