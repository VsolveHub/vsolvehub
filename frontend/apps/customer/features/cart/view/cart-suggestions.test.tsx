import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ServiceCard } from "../queries";
import { CartSuggestions } from "./cart-suggestions";

/**
 * The suggestion strip.
 *
 * The heading promises "the same professional, the same visit". These tests pin
 * the two things that keep that promise honest: an empty answer renders nothing
 * at all, and a card links to the service rather than pretending it can be added
 * without answering its scope questions.
 */

const FAN: ServiceCard = {
  id: "svc-1",
  slug: "fan-installation",
  name: "Fan Installation",
  short_description: "Ceiling and wall fans fitted and tested.",
  category_slug: "technician",
  subcategory_slug: "electrician",
  starting_price: { amount_paise: 29900, currency: "INR" },
  cover: null,
};

describe("when the server suggests nothing", () => {
  it("renders nothing at all rather than a fallback list", () => {
    const { container } = render(<CartSuggestions suggestions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("when the server suggests something", () => {
  it("says why these are worth adding", () => {
    render(<CartSuggestions suggestions={[FAN]} />);

    expect(screen.getByRole("heading", { name: /add to the same visit/i })).toBeInTheDocument();
    expect(screen.getByText(/no second visit fee/i)).toBeInTheDocument();
  });

  it("links to the service so its scope can be answered", () => {
    render(<CartSuggestions suggestions={[FAN]} />);

    expect(screen.getByRole("link", { name: /fan installation/i })).toHaveAttribute(
      "href",
      "/catalog/technician/fan-installation",
    );
  });

  it("shows the server's own starting price and never computes one", () => {
    render(<CartSuggestions suggestions={[FAN]} />);

    expect(screen.getByText("₹299")).toBeInTheDocument();
    expect(screen.getByText(/starts at/i)).toBeInTheDocument();
  });

  it("does not offer a one-tap add, which would invent a variant and a scope", () => {
    render(<CartSuggestions suggestions={[FAN]} />);

    expect(screen.queryByRole("button", { name: /add/i })).not.toBeInTheDocument();
  });
});
