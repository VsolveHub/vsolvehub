import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  availabilityViewFixture,
  fullyBookedAvailabilityFixture,
  instantQuoteViewFixture,
  quoteViewFixture,
} from "../adapters/view-fixtures";
import { BookingTypeStage } from "./booking-type-stage";
import { CancellationLadder } from "./cancellation-ladder";
import { PriceSummary } from "./price-summary";
import { SlotStage } from "./slot-stage";
import { WorkspaceProvider } from "./workspace-context";

/**
 * Component-level checks for the rules a reducer test cannot see: what is
 * actually rendered, what is disabled, and what a customer can click.
 */

function renderInWorkspace(ui: React.ReactElement) {
  return render(<WorkspaceProvider serviceSlug="switch-socket-repair">{ui}</WorkspaceProvider>);
}

describe("booking type stage", () => {
  it("preselects neither option", () => {
    renderInWorkspace(<BookingTypeStage />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
  });

  it("discloses that instant takes payment before assignment", () => {
    // Doc 11 §2: this is the substantive difference between the two, and B5
    // states it again at the pay action. Hiding it until then would be a
    // disclosure failure at the moment the choice is actually made.
    renderInWorkspace(<BookingTypeStage />);
    expect(
      screen.getByText(/payment is taken before a professional is assigned/i),
    ).toBeInTheDocument();
  });

  it("selects a type on click", () => {
    renderInWorkspace(<BookingTypeStage />);
    fireEvent.click(screen.getByRole("radio", { name: /pick a time/i }));
    expect(screen.getByRole("radio", { name: /pick a time/i })).toBeChecked();
  });
});

describe("slot stage", () => {
  const view = availabilityViewFixture();

  it("preselects no date and shows no times until one is chosen", () => {
    renderInWorkspace(<SlotStage availability={view} />);
    expect(screen.getByText(/select a date to see available times/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /–/ })).not.toBeInTheDocument();
  });

  it("shows unavailable windows as disabled rather than hiding them", () => {
    // A gap makes a customer think the platform is broken; "Fully booked" is
    // information they can act on.
    renderInWorkspace(<SlotStage availability={view} />);

    fireEvent.click(screen.getByRole("radio", { name: /today/i }));

    const taken = screen.getByRole("radio", { name: /fully booked/i });
    expect(taken).toBeDisabled();
  });

  it("does not select an unavailable slot when one is clicked", () => {
    renderInWorkspace(<SlotStage availability={view} />);

    fireEvent.click(screen.getByRole("radio", { name: /today/i }));
    const taken = screen.getByRole("radio", { name: /fully booked/i });
    fireEvent.click(taken);

    expect(taken).not.toBeChecked();
  });

  it("selects an available slot", () => {
    renderInWorkspace(<SlotStage availability={view} />);

    fireEvent.click(screen.getByRole("radio", { name: /today/i }));
    const radios = screen.getAllByRole("radio").filter((radio) => !radio.hasAttribute("disabled"));
    const bookable = radios.find((radio) => radio.getAttribute("value")?.startsWith("slot_"));

    expect(bookable).toBeDefined();
    fireEvent.click(bookable!);
    expect(bookable).toBeChecked();
  });

  it("says so honestly when nothing is bookable, and does not invent a time", () => {
    const empty = fullyBookedAvailabilityFixture();

    renderInWorkspace(<SlotStage availability={empty} />);
    expect(screen.getByText(/no times available in the next seven days/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("price summary", () => {
  it("labels the catalog price as a starting price before a quote exists", () => {
    // Never a bare number, and never ₹0 — a zero is a number, and a number
    // reads as a price.
    render(<PriceSummary quote={null} startingPricePaise={19900} />);
    expect(screen.getByText(/starts at/i)).toBeInTheDocument();
    expect(screen.getByText("₹199")).toBeInTheDocument();
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
  });

  it("shows the server total rather than a sum of the lines", () => {
    render(<PriceSummary quote={quoteViewFixture()} startingPricePaise={19900} />);
    const total = screen.getByText(/^total$/i).closest("div");
    expect(within(total as HTMLElement).getByText("₹481.44")).toBeInTheDocument();
  });

  it("uses the tax label the server sent", () => {
    render(<PriceSummary quote={quoteViewFixture()} startingPricePaise={null} />);
    expect(screen.getByText("GST 18%")).toBeInTheDocument();
  });
});

describe("cancellation ladder", () => {
  it("renders every scheduled band with rupee amounts", () => {
    const view = quoteViewFixture();
    render(
      <CancellationLadder
        bands={view.cancellationBands}
        policyVersion={view.cancellationPolicyVersion}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/more than 24 hours before your slot/i)).toBeInTheDocument();
    expect(screen.getByText(/₹481\.44 back/)).toBeInTheDocument();
  });

  it("renders the five instant bands from the same component", () => {
    // The component does not know which ladder it received, which is what keeps
    // the policy in one place.
    const view = instantQuoteViewFixture();
    render(
      <CancellationLadder
        bands={view.cancellationBands}
        policyVersion={view.cancellationPolicyVersion}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(
      screen.getByText(/any time before a professional is assigned/i),
    ).toBeInTheDocument();
  });
});
