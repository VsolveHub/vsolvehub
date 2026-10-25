import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteAddress } from "./site-address";

describe("SiteAddress", () => {
  it("shows only the locality while customer payment is pending", () => {
    render(<SiteAddress address={null} approximateArea="Kukatpally, Hyderabad" />);

    expect(screen.getByText("Near Kukatpally, Hyderabad")).toBeInTheDocument();
    expect(screen.getByText(/Exact address appears after customer payment/i)).toBeInTheDocument();
    expect(screen.queryByText("Plot 14")).not.toBeInTheDocument();
  });

  it("shows the destination after the paid visit is scheduled", () => {
    render(
      <SiteAddress
        approximateArea="Kukatpally, Hyderabad"
        address={{
          line1: "Plot 14",
          line2: "Second floor",
          landmark: "Metro station",
          locality: "Kukatpally",
          city: "Hyderabad",
          state: "Telangana",
          postal_code: "500072",
          directions_url: "https://www.google.com/maps/dir/?api=1&destination=17.494812,78.399574",
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Site address" })).toBeInTheDocument();
    expect(screen.getByText("Plot 14")).toBeInTheDocument();
    expect(screen.getByText("Second floor")).toBeInTheDocument();
    expect(screen.getByText("Near Metro station")).toBeInTheDocument();
    expect(screen.getByText("Kukatpally, Hyderabad, 500072")).toBeInTheDocument();
  });

  it("routes to the Customer's pin, not a search for the text", () => {
    render(<SiteAddress approximateArea="Kukatpally, Hyderabad" address={PINNED} />);

    expect(screen.getByRole("link", { name: /open route in maps/i })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=17.494812,78.399574",
    );
  });

  it("routes to the typed address only when the server sent no pin", () => {
    render(
      <SiteAddress
        approximateArea="Kukatpally, Hyderabad"
        address={{ ...PINNED, directions_url: "" }}
      />,
    );

    const href = screen.getByRole("link", { name: /open route in maps/i }).getAttribute("href");
    expect(href).toContain("destination=Plot%2014");
  });
});

const PINNED = {
  line1: "Plot 14",
  line2: "",
  landmark: "",
  locality: "Kukatpally",
  city: "Hyderabad",
  state: "Telangana",
  postal_code: "500072",
  directions_url: "https://www.google.com/maps/dir/?api=1&destination=17.494812,78.399574",
};
