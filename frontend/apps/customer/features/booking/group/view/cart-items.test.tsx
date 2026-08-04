import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { cart, cartItem } from "../fixtures";
import { CartItems, CartVersionNote } from "./cart-items";

/**
 * The cart, which is now a list.
 *
 * The regression these tests exist for is the one the singleton flow made
 * structurally impossible to see: a second service replacing the first. Under
 * the Booking Group model every item the server returns is rendered, so the
 * tests assert on *both* rows rather than on "the item".
 */

const twoItems = cart({
  version: 4,
  items: [
    cartItem({ id: "item-1", version: 2, service_name: "Fan installation" }),
    cartItem({
      id: "item-2",
      version: 1,
      service_name: "Geyser repair",
      variant_name: "Storage geyser",
      quantity: 3,
    }),
  ],
});

function renderCart(overrides: Partial<Parameters<typeof CartItems>[0]> = {}) {
  const props = {
    cart: twoItems,
    pendingItemIds: [] as readonly string[],
    onUpdateQuantity: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  render(<CartItems {...props} />);
  return props;
}

describe("more than one service", () => {
  it("renders every item the server returned", () => {
    renderCart();

    expect(screen.getByRole("heading", { name: "Fan installation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Geyser repair" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps each item's own quantity rather than sharing one", () => {
    renderCart();

    const fan = screen.getByRole("heading", { name: "Fan installation" }).closest("li")!;
    const geyser = screen.getByRole("heading", { name: "Geyser repair" }).closest("li")!;

    expect(within(fan).getByRole("status")).toHaveTextContent("1");
    expect(within(geyser).getByRole("status")).toHaveTextContent("3");
  });

  it("adding a second service is never presented as replacing the first", () => {
    // The singleton flow's confirmation dialog asked exactly this. Nothing on
    // this screen may offer to discard one item for another.
    renderCart();

    expect(screen.queryByText(/discard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/replace/i)).not.toBeInTheDocument();
  });
});

describe("editing an item", () => {
  it("sends the item's own identity and version, not the list position", () => {
    const props = renderCart();

    const geyser = screen.getByRole("heading", { name: "Geyser repair" }).closest("li")!;
    fireEvent.click(within(geyser).getByRole("button", { name: /increase geyser repair/i }));

    expect(props.onUpdateQuantity).toHaveBeenCalledWith({
      item: expect.objectContaining({ id: "item-2", version: 1 }),
      quantity: 4,
    });
  });

  it("will not step below the server's minimum of one", () => {
    // Going lower is a removal, and a stepper that quietly deletes a line is a
    // destructive action with no confirmation.
    renderCart();

    const fan = screen.getByRole("heading", { name: "Fan installation" }).closest("li")!;
    expect(within(fan).getByRole("button", { name: /reduce fan installation/i })).toBeDisabled();
  });

  it("disables only the row with a request in flight", () => {
    // Freezing the whole list would stop a customer editing an unrelated
    // service because one row is saving.
    renderCart({ pendingItemIds: ["item-1"] });

    const fan = screen.getByRole("heading", { name: "Fan installation" }).closest("li")!;
    const geyser = screen.getByRole("heading", { name: "Geyser repair" }).closest("li")!;

    expect(within(fan).getByRole("button", { name: /increase/i })).toBeDisabled();
    expect(within(geyser).getByRole("button", { name: /increase/i })).toBeEnabled();
  });

  it("labels each control with the service it belongs to", () => {
    // "Increase" twice on one screen tells a screen-reader user nothing about
    // which service is about to change.
    renderCart();

    expect(
      screen.getByRole("button", { name: "Increase Fan installation quantity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase Geyser repair quantity" }),
    ).toBeInTheDocument();
  });
});

describe("removal", () => {
  it("renders a remove control per item", () => {
    const onRemove = vi.fn();
    renderCart({ onRemove });

    fireEvent.click(screen.getByRole("button", { name: "Remove Geyser repair" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "item-2" }));
  });

  it("disables remove on the in-flight row only", () => {
    renderCart({ pendingItemIds: ["item-1"] });

    expect(screen.getByRole("button", { name: "Remove Fan installation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Geyser repair" })).toBeEnabled();
  });
});

describe("an empty cart", () => {
  it("says nothing is there and that more than one service is allowed", () => {
    renderCart({ cart: cart({ items: [] }) });

    expect(screen.getByText("Nothing in your booking yet")).toBeInTheDocument();
    expect(screen.getByText(/add more than one/i)).toBeInTheDocument();
  });
});

describe("the cart version", () => {
  it("is shown, because every command is checked against it", () => {
    render(<CartVersionNote cart={twoItems} />);
    expect(screen.getByText(/2 services · saved version/)).toHaveTextContent("4");
  });
});
