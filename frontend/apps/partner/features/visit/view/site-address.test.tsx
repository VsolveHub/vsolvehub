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
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Site address" })).toBeInTheDocument();
    expect(screen.getByText("Plot 14")).toBeInTheDocument();
    expect(screen.getByText("Second floor")).toBeInTheDocument();
    expect(screen.getByText("Near Metro station")).toBeInTheDocument();
    expect(screen.getByText("Kukatpally, Hyderabad, 500072")).toBeInTheDocument();
  });
});
