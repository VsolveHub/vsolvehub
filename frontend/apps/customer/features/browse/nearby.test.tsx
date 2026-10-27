import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EMPTY_PLACE, type PlaceFilterValue } from "@vsolve/ui/location-picker";

import { NearbyNotice, placeQuery } from "./nearby";

const KUKATPALLY: PlaceFilterValue = {
  name: "Kukatpally",
  latitude: 17.4948,
  longitude: 78.3996,
  source: "place",
};
const DEVICE: PlaceFilterValue = { ...KUKATPALLY, name: "Near me", source: "device" };

describe("placeQuery", () => {
  it("sends typed text as a text search", () => {
    expect(placeQuery({ ...EMPTY_PLACE, name: " Gachibowli " })).toEqual({ location: "Gachibowli" });
  });

  it("sends a picked place's point, and its name for listings with no pin", () => {
    expect(placeQuery(KUKATPALLY)).toEqual({ location: "Kukatpally", lat: 17.4948, lng: 78.3996 });
  });

  it("sends no name for Near me", () => {
    expect(placeQuery(DEVICE)).toEqual({ location: "", lat: 17.4948, lng: 78.3996 });
  });
});

describe("NearbyNotice", () => {
  it("says nothing when the place has its own listings", () => {
    const { container } = render(
      <NearbyNotice place={KUKATPALLY} noun="stays" count={4} nearestKm={0.8} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says the results are nearby when the nearest is a few km off", () => {
    render(<NearbyNotice place={KUKATPALLY} noun="stays" count={4} nearestKm={7.2} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No stays in Kukatpally yet — showing the nearest ones.",
    );
  });

  it("says when nothing is within the radius", () => {
    render(<NearbyNotice place={DEVICE} noun="rentals" count={0} nearestKm={undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No rentals within 25 km of your location yet.",
    );
  });

  it("says nothing for a text-only search", () => {
    const { container } = render(
      <NearbyNotice place={{ ...EMPTY_PLACE, name: "Kukatpally" }} noun="stays" count={0} nearestKm={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
