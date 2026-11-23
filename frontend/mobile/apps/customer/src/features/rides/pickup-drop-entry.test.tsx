import { fireEvent, render } from "@testing-library/react-native";

import { homeAvailability } from "./use-home-availability";
import { PickupDropEntry } from "./pickup-drop-entry";

const mockPush = jest.fn();
let mockStatus = "signedIn";
let mockAvailability = { rides: true, parcel: true };

jest.mock("./use-home-availability", () => ({
  ...jest.requireActual("./use-home-availability"),
  useHomeAvailability: () => mockAvailability,
}));
jest.mock("@vsolve/mobile-core", () => ({
  useAuthStore: (select: (state: { status: string }) => unknown) => select({ status: mockStatus }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockPush.mockClear();
  mockStatus = "signedIn";
  mockAvailability = { rides: true, parcel: true };
});

test("shows the card with its words, and opens Where should it go?", async () => {
  const view = await render(<PickupDropEntry />);

  expect(view.getByText("Pick up & Drop")).toBeTruthy();
  expect(view.getByText("Send or get a parcel · Bike or Auto")).toBeTruthy();
  fireEvent.press(view.getByLabelText("Pick up and Drop"));
  expect(mockPush).toHaveBeenCalledWith("/rides/parcel");
});

test("is hidden where no parcel card is active, and rides keep their own card", async () => {
  mockAvailability = { rides: true, parcel: false };

  const view = await render(<PickupDropEntry />);

  expect(view.queryByText("Pick up & Drop")).toBeNull();
});

test("is not shown to a signed-out customer", async () => {
  mockStatus = "signedOut";

  expect((await render(<PickupDropEntry />)).queryByText("Pick up & Drop")).toBeNull();
});

describe("what the server's answer means for Home (D21)", () => {
  it("shows each card only where its own list is not empty", () => {
    expect(homeAvailability({ vehicle_types: ["BIKE"], parcel: [] })).toEqual({ rides: true, parcel: false });
    expect(homeAvailability({ vehicle_types: [], parcel: [{}] })).toEqual({ rides: false, parcel: true });
    expect(homeAvailability({ vehicle_types: [], parcel: [] })).toEqual({ rides: false, parcel: false });
  });

  it("keeps both cards while nothing is known: no location, loading, or an error", () => {
    expect(homeAvailability(undefined)).toEqual({ rides: true, parcel: true });
  });
});
