import { render, screen } from "@testing-library/react";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { PickupAddress } from "../pickup";

// Read when `@/lib/google-maps` loads, so it is set before the import below.
vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "test-browser-key");
const { PickupLocation } = await import("./pickup-location");

afterAll(() => {
  vi.unstubAllEnvs();
});

function address(overrides: Partial<PickupAddress> = {}): PickupAddress {
  return {
    partner_name: "Owner Co",
    line: "Plot 12, KPHB Colony",
    area: "Kukatpally",
    city: "Hyderabad",
    pincode: "500072",
    latitude: "17.494812",
    longitude: "78.399574",
    maps_url: "https://www.google.com/maps/search/?api=1&query=17.494812,78.399574",
    ...overrides,
  };
}

describe("pickup location", () => {
  it("shows the owner's pin on the item's own page", () => {
    render(<PickupLocation address={address()} showMap />);

    const frame = screen.getByTitle("Map of the pickup location");
    expect(frame.getAttribute("src")).toContain("q=17.494812%2C78.399574");
  });

  it("keeps a list of bookings free of maps", () => {
    render(<PickupLocation address={address()} />);

    expect(screen.queryByTitle("Map of the pickup location")).toBeNull();
  });

  it("shows no map for an ad from before pins, only the address link", () => {
    render(
      <PickupLocation
        address={address({
          latitude: null,
          longitude: null,
          maps_url: "https://www.google.com/maps/search/?api=1&query=Plot%2012",
        })}
        showMap
      />,
    );

    expect(screen.queryByTitle("Map of the pickup location")).toBeNull();
    expect(screen.getByRole("link", { name: /view location/i })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=Plot%2012",
    );
  });
});
