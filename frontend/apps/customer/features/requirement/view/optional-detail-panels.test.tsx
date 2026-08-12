import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SCREENS } from "../model/screens";
import { RequirementProvider } from "./requirement-context";
import { ReviewScreen } from "./review-screen";

/**
 * `M2-FE-207` / `FLOW-02` — the four extras as panels, not as steps.
 *
 * The properties defended here are the ones a plausible redesign breaks: that
 * opening an extra never adds a screen, that a panel the Customer did not touch
 * is never reported back as an answer, and that the copy does not promise the
 * one thing it must not — that a number or a payment has moved.
 */

function renderReview() {
  return render(
    <RequirementProvider categorySlug="housekeeping-staff">
      <ReviewScreen
        categoryName="Housekeeping staff"
        addressLines={["12 Jubilee Hills", "Hyderabad 500033"]}
        isFree={null}
        onSubmit={vi.fn()}
        isSubmitting={false}
        submitError={null}
      />
    </RequirementProvider>,
  );
}

function openPanel(name: RegExp): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("region", { name });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("the extras are reachable from review", () => {
  it("offers all four without adding a screen", () => {
    renderReview();

    for (const label of [
      "Ask us to call you",
      "Request a site visit",
      "Access instructions",
      "How to reach you",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }

    // The budget the panels exist to protect. Four entry points, four screens.
    expect(SCREENS).toHaveLength(4);
  });

  it("opens one at a time and names the panel from the button that opened it", () => {
    renderReview();

    const callback = screen.getByRole("button", { name: /ask us to call you/i });
    fireEvent.click(callback);

    expect(callback).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: /ask us to call you/i })).toBeInTheDocument();

    // Opening a second closes the first: two open panels turn a compact review
    // into the long form the audit removed.
    fireEvent.click(screen.getByRole("button", { name: /access instructions/i }));
    expect(callback).toHaveAttribute("aria-expanded", "false");
  });

  it("says the extras are optional before anyone opens one", () => {
    renderReview();

    expect(screen.getByText(/none of these are needed to send your request/i)).toBeInTheDocument();
  });
});

describe("what a panel is allowed to promise", () => {
  it("does not imply a professional gets the Customer's number", () => {
    renderReview();

    openPanel(/ask us to call you/i);
    expect(screen.getByText(/nobody sees your number from here/i)).toBeInTheDocument();

    openPanel(/how to reach you/i);
    expect(screen.getByText(/only shared after you choose a professional/i)).toBeInTheDocument();
  });

  it("does not present site-visit interest as a booking or a charge", () => {
    renderReview();

    const panel = openPanel(/request a site visit/i);

    expect(within(panel).getByText(/nothing is charged from here/i)).toBeInTheDocument();
    expect(within(panel).getByText(/this is not a booking/i)).toBeInTheDocument();
  });
});

describe("the summary on the button", () => {
  it("says nothing about a panel that was opened and left alone", () => {
    renderReview();

    const button = screen.getByRole("button", { name: /how to reach you/i });
    fireEvent.click(button);
    fireEvent.click(button);

    // The radio group opens on "A phone call". Echoing that back would be the
    // screen telling the Customer they chose something they never chose.
    expect(button).not.toHaveTextContent(/phone call/i);
  });

  it("reports what the Customer actually chose", () => {
    renderReview();

    const panel = openPanel(/ask us to call you/i);
    fireEvent.click(within(panel).getByRole("checkbox", { name: /give me a call/i }));
    fireEvent.click(
      within(screen.getByRole("region", { name: /ask us to call you/i })).getByRole("radio", {
        name: /morning/i,
      }),
    );

    expect(screen.getByRole("button", { name: /ask us to call you/i })).toHaveTextContent(
      /call me — morning/i,
    );
  });

  it("shortens a long list of access constraints instead of printing all of it", () => {
    renderReview();

    openPanel(/access instructions/i);
    for (const name of [/no lift/i, /nowhere to park/i, /pets on site/i]) {
      const panel = screen.getByRole("region", { name: /access instructions/i });
      fireEvent.click(within(panel).getByRole("checkbox", { name }));
    }

    expect(screen.getByRole("button", { name: /access instructions/i })).toHaveTextContent(
      /and 1 more/i,
    );
  });
});

describe("the half-said access constraint", () => {
  function tickRestrictedHours() {
    openPanel(/access instructions/i);
    const panel = screen.getByRole("region", { name: /access instructions/i });
    fireEvent.click(within(panel).getByRole("checkbox", { name: /only allowed at certain hours/i }));
  }

  it("says what is missing and why it matters", () => {
    renderReview();
    tickRestrictedHours();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/please say which hours/i);
    // Not "required" — the reason is what stops the Customer unticking and
    // moving on with a constraint the vendor will never hear about.
    expect(alert).toHaveTextContent(/cannot plan around/i);
  });

  it("clears once the hours are described", () => {
    renderReview();
    tickRestrictedHours();

    const panel = screen.getByRole("region", { name: /access instructions/i });
    fireEvent.change(within(panel).getByRole("textbox"), {
      target: { value: "Weekdays after 10am" },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the submit control on review", () => {
  it("is never disabled without saying why", () => {
    renderReview();

    const submit = screen.getByRole("button", { name: /send this request/i });
    expect(submit).toBeDisabled();
    // The pairing the workspace enforces on screens 1–3, repeated here because
    // review has no "Next" for the workspace to explain.
    expect(screen.getByRole("status")).toHaveTextContent(/please answer the questions/i);
  });

  it("says nothing about price until the server has said it is free", () => {
    renderReview();

    expect(screen.queryByText(/nothing is charged/i)).not.toBeInTheDocument();
  });
});
