import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ServiceCard } from "../queries";
import { CartSuggestions } from "./cart-suggestions";

/**
 * The suggestion strip.
 *
 * The heading promises "the same professional, the same visit". These tests pin what keeps that
 * promise honest: an empty answer renders nothing at all, a service with one variant can be
 * added in a tap, and a service with several sends the customer to choose rather than picking
 * for them.
 */

const FAN: ServiceCard = {
  id: "svc-1",
  slug: "fan-installation",
  name: "Fan Installation",
  short_description: "Ceiling and wall fans fitted and tested.",
  category_slug: "technician",
  subcategory_slug: "electrician",
  // Empty: a suggestion is always a priced A1 service. `public_services_by_id` keeps the rate
  // gate the catalog listing dropped at 1.27.0, because a per-job service cannot join a cart.
  request_archetypes: [],
  bookable_variant_id: "variant-fan-1",
  starting_price: { amount_paise: 29900, currency: "INR" },
  // Required since 1.43.0: the backend owns the icon vocabulary and refuses to
  // publish a service without one.
  icon_key: "electrical",
  cover: null,
};

describe("when the server suggests nothing", () => {
  it("renders nothing at all rather than a fallback list", () => {
    const { container } = render(<CartSuggestions suggestions={[]} onAdd={() => {}} addingVariantId={null} isAdding={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("when the server suggests something", () => {
  it("says why these are worth adding", () => {
    render(<CartSuggestions suggestions={[FAN]} onAdd={() => {}} addingVariantId={null} isAdding={false} />);

    expect(screen.getByRole("heading", { name: /add to the same visit/i })).toBeInTheDocument();
    expect(screen.getByText(/no second visit fee/i)).toBeInTheDocument();
  });

  it("links to the service so its scope can be answered", () => {
    render(<CartSuggestions suggestions={[FAN]} onAdd={() => {}} addingVariantId={null} isAdding={false} />);

    expect(screen.getByRole("link", { name: /fan installation/i })).toHaveAttribute(
      "href",
      "/catalog/technician/fan-installation",
    );
  });

  it("shows the server's own starting price and never computes one", () => {
    render(<CartSuggestions suggestions={[FAN]} onAdd={() => {}} addingVariantId={null} isAdding={false} />);

    expect(screen.getByText("₹299")).toBeInTheDocument();
    expect(screen.getByText(/starts at/i)).toBeInTheDocument();
  });

  it("adds a single-variant service in one tap, with the variant the server named", () => {
    const onAdd = vi.fn();
    render(
      <CartSuggestions suggestions={[FAN]} onAdd={onAdd} addingVariantId={null} isAdding={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    // The id comes from `bookable_variant_id`. Choosing one here would be the browser deciding
    // what was bought.
    expect(onAdd).toHaveBeenCalledWith("variant-fan-1");
  });

  it("sends a multi-variant service to choose rather than picking one", () => {
    const choice = { ...FAN, bookable_variant_id: null };
    render(
      <CartSuggestions suggestions={[choice]} onAdd={() => {}} addingVariantId={null} isAdding={false} />,
    );

    // No Add: a repair and a 32-amp replacement are different jobs at different prices, and
    // guessing would put a price on screen for work the customer never described.
    expect(screen.queryByRole("button", { name: /^add/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose an option/i })).toHaveAttribute(
      "href",
      "/catalog/technician/fan-installation",
    );
  });

  it("spins only the card being added, not the whole strip", () => {
    const second = { ...FAN, slug: "tap-repair", name: "Tap Repair", bookable_variant_id: "v2" };
    render(
      <CartSuggestions
        suggestions={[FAN, second]}
        onAdd={() => {}}
        addingVariantId="variant-fan-1"
        isAdding
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /add/i });
    expect(buttons).toHaveLength(2);
    // Only the card being added reports itself busy...
    expect(buttons.filter((button) => button.getAttribute("aria-busy") === "true")).toHaveLength(1);
    // ...but both are blocked, so a second tap cannot race the first request's cart version.
    expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(true);
  });
});
