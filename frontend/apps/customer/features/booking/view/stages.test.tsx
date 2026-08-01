import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  committedSessionFixture,
  exhaustedSessionFixture,
  fullyBookedWindowsFixture,
  quoteViewFixture,
  searchingSessionFixture,
  twoBandQuoteViewFixture,
  windowsViewFixture,
} from "../adapters/view-fixtures";
import { AddressStage, isGeocoded } from "./address-stage";
import { CancellationLadder } from "./cancellation-ladder";
import { FindingStage } from "./finding-stage";
import { PriceSummary } from "./price-summary";
import { TaskPicker } from "./task-picker";
import { WindowStage } from "./window-stage";
import { useWorkspace, WorkspaceProvider } from "./workspace-context";

/**
 * Component-level checks for the rules a reducer test cannot see: what is
 * actually rendered, what is disabled, and what a customer can click.
 */

/**
 * The workspace persists customer intent to sessionStorage, which jsdom keeps
 * for the whole file. Without this, one test's task quantities restore into the
 * next test's "nothing is selected yet" assertions.
 */
beforeEach(() => {
  window.sessionStorage.clear();
});

function renderInWorkspace(ui: React.ReactElement) {
  return render(<WorkspaceProvider serviceSlug="fan-installation">{ui}</WorkspaceProvider>);
}

const TASKS = [
  { code: "fan-installation", label: "Fan installation", unitPricePaise: 24900 },
  { code: "light-led-installation", label: "LED light installation", unitPricePaise: 12900 },
];

const ADDRESS = {
  id: "addr_1",
  label: "Home",
  line1: "Flat 402",
  locality: "Kukatpally",
  city: "Hyderabad",
  state: "Telangana",
  postal_code: "500072",
  country_code: "IN",
  latitude: "17.494700",
  longitude: "78.399500",
  source: "REVERSE_GEOCODED",
  confirmed_at: "2026-07-30T09:00:00Z",
  created_at: "2026-07-30T09:00:00Z",
  updated_at: "2026-07-30T09:00:00Z",
} as Schemas["Address"];

function AddressStageHarness({
  addresses,
  onUseCurrentLocation = () => undefined,
  onUpdateAddress = () => undefined,
  locationError = null,
  updateError = null,
}: {
  addresses: readonly Schemas["Address"][];
  onUseCurrentLocation?: () => void;
  onUpdateAddress?: (
    addressId: string,
    patch: Schemas["PatchedAddressRequest"],
  ) => void;
  locationError?: string | null;
  updateError?: string | null;
}) {
  const { dispatch } = useWorkspace();

  return (
    <AddressStage
      addresses={addresses}
      isLoading={false}
      serviceability={null}
      isCheckingServiceability={false}
      onSelect={(address) =>
        dispatch({
          type: "SET_ADDRESS",
          address: {
            id: address.id,
            postalCode: address.postal_code,
            isGeocoded: isGeocoded(address),
            isServiceable: false,
          },
        })
      }
      onUseCurrentLocation={onUseCurrentLocation}
      isUsingCurrentLocation={false}
      locationError={locationError}
      onUpdateAddress={onUpdateAddress}
      isUpdatingAddress={false}
      updateError={updateError}
    />
  );
}

describe("address stage", () => {
  it("asks for a pinned location when no saved addresses exist", () => {
    const onUseCurrentLocation = vi.fn();
    renderInWorkspace(
      <AddressStageHarness addresses={[]} onUseCurrentLocation={onUseCurrentLocation} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));
    expect(onUseCurrentLocation).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/server reverse-geocodes/i)).toBeInTheDocument();
  });

  it("selects a saved address and checks serviceability separately", () => {
    renderInWorkspace(<AddressStageHarness addresses={[ADDRESS]} />);

    fireEvent.click(screen.getByRole("radio", { name: /home/i }));
    expect(screen.getByRole("radio", { name: /home/i })).toBeChecked();
    expect(screen.queryByText(/we cover this area/i)).not.toBeInTheDocument();
  });

  it("edits the selected address without changing its pin", () => {
    const onUpdateAddress = vi.fn();
    renderInWorkspace(
      <AddressStageHarness addresses={[ADDRESS]} onUpdateAddress={onUpdateAddress} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /home/i }));
    fireEvent.change(screen.getByLabelText(/house, flat or building/i), {
      target: { value: "Flat 501" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save address/i }));

    expect(onUpdateAddress).toHaveBeenCalledWith(
      "addr_1",
      expect.objectContaining({ line1: "Flat 501" }),
    );
  });

  it("shows address mutation errors beside the relevant action", () => {
    renderInWorkspace(
      <AddressStageHarness
        addresses={[ADDRESS]}
        locationError="Location permission was denied."
        updateError="This PIN code is invalid."
      />,
    );

    expect(screen.getByText(/location permission was denied/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /home/i }));
    expect(screen.getByText(/this pin code is invalid/i)).toBeInTheDocument();
  });
});

describe("task picker", () => {
  it("selects nothing by default", () => {
    renderInWorkspace(<TaskPicker tasks={TASKS} minimumSubtotalPaise={19900} />);
    for (const quantity of screen.getAllByText("0")) {
      expect(quantity).toBeInTheDocument();
    }
  });

  it("shows the per-unit price for each task", () => {
    renderInWorkspace(<TaskPicker tasks={TASKS} minimumSubtotalPaise={19900} />);
    expect(screen.getByText("₹249 each")).toBeInTheDocument();
    expect(screen.getByText("₹129 each")).toBeInTheDocument();
  });

  it("discloses the minimum visit charge when the basket is below it", () => {
    // The minimum must be visible from the catalog onward — an unreachable
    // "starts at" price is forbidden. A customer picking one ₹129 task has to
    // learn they will pay ₹199 at the moment they pick it.
    renderInWorkspace(<TaskPicker tasks={TASKS} minimumSubtotalPaise={19900} />);
    fireEvent.click(screen.getByRole("button", { name: /add one LED light installation/i }));
    expect(screen.getByText(/minimum visit charge/i)).toBeInTheDocument();
    expect(screen.getByText("₹199")).toBeInTheDocument();
  });

  it("does not mention the minimum once the basket exceeds it", () => {
    renderInWorkspace(<TaskPicker tasks={TASKS} minimumSubtotalPaise={19900} />);
    fireEvent.click(screen.getByRole("button", { name: /add one Fan installation/i }));
    expect(screen.queryByText(/minimum visit charge/i)).not.toBeInTheDocument();
  });

  it("cannot go below zero", () => {
    renderInWorkspace(<TaskPicker tasks={TASKS} minimumSubtotalPaise={19900} />);
    expect(screen.getByRole("button", { name: /remove one Fan installation/i })).toBeDisabled();
  });
});

describe("window stage", () => {
  const view = windowsViewFixture();

  it("preselects no date and shows no windows until one is chosen", () => {
    renderInWorkspace(<WindowStage windows={view} />);
    expect(screen.getByText(/select a date to see available windows/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /–/ })).not.toBeInTheDocument();
  });

  it("shows the server's duration estimate rather than asking for one", () => {
    // ADR-008: duration is a capacity estimate, not a customer input. There is
    // no control here, only a readout.
    renderInWorkspace(<WindowStage windows={view} />);
    expect(screen.getByText(/about 60 minutes/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows unavailable windows as disabled rather than hiding them", () => {
    // A gap makes a customer think the platform is broken; "Too soon to book" is
    // information they can act on.
    renderInWorkspace(<WindowStage windows={view} />);
    fireEvent.click(screen.getByRole("radio", { name: /today/i }));
    expect(screen.getByRole("radio", { name: /too soon to book/i })).toBeDisabled();
  });

  it("does not select an unavailable window when one is clicked", () => {
    renderInWorkspace(<WindowStage windows={view} />);
    fireEvent.click(screen.getByRole("radio", { name: /today/i }));
    const taken = screen.getByRole("radio", { name: /too soon to book/i });
    fireEvent.click(taken);
    expect(taken).not.toBeChecked();
  });

  it("selects an available window", () => {
    renderInWorkspace(<WindowStage windows={view} />);
    fireEvent.click(screen.getByRole("radio", { name: /today/i }));
    const bookable = screen
      .getAllByRole("radio")
      .filter((radio) => !radio.hasAttribute("disabled"))
      .find((radio) => radio.getAttribute("value")?.startsWith("win_"));

    expect(bookable).toBeDefined();
    fireEvent.click(bookable!);
    expect(bookable).toBeChecked();
  });

  it("says so honestly when nothing is bookable, and does not invent a time", () => {
    renderInWorkspace(<WindowStage windows={fullyBookedWindowsFixture()} />);
    expect(
      screen.getByText(/no arrival windows available in the next seven days/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("finding stage", () => {
  const noop = () => {};

  it("names no professional while the search is running", () => {
    // An offer is not a commitment. A Partner who declines must never have been
    // shown to the customer.
    render(
      <FindingStage
        session={searchingSessionFixture()}
        onCancel={noop}
        onRetry={noop}
        onPay={noop}
      />,
    );
    expect(screen.getByText(/finding a professional/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ramesh/)).not.toBeInTheDocument();
  });

  it("shows no pay action during the search", () => {
    render(
      <FindingStage
        session={searchingSessionFixture()}
        onCancel={noop}
        onRetry={noop}
        onPay={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: /pay/i })).not.toBeInTheDocument();
  });

  it("states that nothing has been charged and the tab can be closed", () => {
    render(
      <FindingStage
        session={searchingSessionFixture()}
        onCancel={noop}
        onRetry={noop}
        onPay={noop}
      />,
    );
    expect(screen.getByText(/you have not been charged/i)).toBeInTheDocument();
    expect(screen.getByText(/close this page/i)).toBeInTheDocument();
  });

  it("offers a free cancel throughout the search", () => {
    render(
      <FindingStage
        session={searchingSessionFixture()}
        onCancel={noop}
        onRetry={noop}
        onPay={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /cancel search/i })).toBeEnabled();
  });

  it("enables payment only once a Partner has committed", () => {
    render(
      <FindingStage
        session={committedSessionFixture()}
        onCancel={noop}
        onRetry={noop}
        onPay={noop}
      />,
    );
    expect(screen.getByRole("button", { name: /pay and confirm/i })).toBeEnabled();
    expect(screen.getByText(/Ramesh K\./)).toBeInTheDocument();
  });

  it("says the pool was exhausted rather than spinning forever", () => {
    render(
      <FindingStage
        session={exhaustedSessionFixture()}
        onCancel={noop}
        onRetry={noop}
        onPay={noop}
      />,
    );
    expect(screen.getByText(/no professional was available/i)).toBeInTheDocument();
    expect(screen.getByText(/you have not been charged/i)).toBeInTheDocument();
    expect(screen.getByText(/try a wider arrival window/i)).toBeInTheDocument();
  });

  it("shows no fabricated progress indicator", () => {
    // The server publishes no per-offer progress, so there is no percentage and
    // no "2 of 3 contacted" to show.
    render(
      <FindingStage
        session={searchingSessionFixture()}
        onCancel={noop}
        onRetry={noop}
        onPay={noop}
      />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*%/)).not.toBeInTheDocument();
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
    expect(within(total as HTMLElement).getByText("₹293.82")).toBeInTheDocument();
  });

  it("uses the tax label the server sent", () => {
    render(<PriceSummary quote={quoteViewFixture()} startingPricePaise={null} />);
    expect(screen.getByText("GST 18%")).toBeInTheDocument();
  });
});

describe("cancellation ladder", () => {
  it("renders every band with its rupee fee", () => {
    const view = quoteViewFixture();
    render(
      <CancellationLadder
        bands={view.cancellationBands}
        policyVersion={view.cancellationPolicyVersion}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(
      screen.getByText(/more than 24 hours before your arrival window/i),
    ).toBeInTheDocument();
    expect(screen.getByText("₹49")).toBeInTheDocument();
  });

  it("marks a free band rather than showing a ₹0 fee", () => {
    const view = quoteViewFixture();
    render(
      <CancellationLadder
        bands={view.cancellationBands}
        policyVersion={view.cancellationPolicyVersion}
      />,
    );
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
  });

  it("renders a different-shaped ladder from the same component", () => {
    // The component does not know how many bands it received, which is what
    // keeps the policy in one place — the server's.
    const view = twoBandQuoteViewFixture();
    render(
      <CancellationLadder
        bands={view.cancellationBands}
        policyVersion={view.cancellationPolicyVersion}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
