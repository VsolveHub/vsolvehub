import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { homeAvailability } from "./use-home-availability";
import { PickupDropEntry } from "./pickup-drop-entry";
import { resetOpenRideCheck } from "./use-land-on-open-ride";

const mockPush = jest.fn();
const mockFindOpenRide = jest.fn();
let mockStatus = "signedIn";
let mockAvailability = { rides: true, parcel: true };

jest.mock("./queries", () => ({ findOpenRide: () => mockFindOpenRide() }));
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
  mockFindOpenRide.mockReset().mockResolvedValue(null);
  mockStatus = "signedIn";
  mockAvailability = { rides: true, parcel: true };
  resetOpenRideCheck();
});

describe("the one Pick up & Drop card", () => {
  test("shows its words, and asks which when both a ride and a parcel run here", async () => {
    const view = await render(<PickupDropEntry />);

    expect(view.getByText("Pick up & Drop")).toBeTruthy();
    expect(view.getByText("Rides and parcels")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Pick up and Drop"));
    expect(mockPush).toHaveBeenCalledWith("/rides/start");
  });

  test("goes straight to rides where no parcel card is active", async () => {
    mockAvailability = { rides: true, parcel: false };

    const view = await render(<PickupDropEntry />);
    await fireEvent.press(view.getByLabelText("Pick up and Drop"));

    expect(mockPush).toHaveBeenCalledWith("/rides");
  });

  test("goes straight to parcels where no ride can be booked", async () => {
    mockAvailability = { rides: false, parcel: true };

    const view = await render(<PickupDropEntry />);
    await fireEvent.press(view.getByLabelText("Pick up and Drop"));

    expect(mockPush).toHaveBeenCalledWith("/rides/parcel");
  });

  test("is hidden where neither a ride nor a parcel can be booked (D21)", async () => {
    mockAvailability = { rides: false, parcel: false };

    expect((await render(<PickupDropEntry />)).queryByText("Pick up & Drop")).toBeNull();
  });

  test("is not shown to a signed-out customer", async () => {
    mockStatus = "signedOut";

    expect((await render(<PickupDropEntry />)).queryByText("Pick up & Drop")).toBeNull();
  });
});

describe("reopening the app (brief §5.11, item 9)", () => {
  test("lands on the ride still going, once per launch", async () => {
    mockFindOpenRide.mockResolvedValue("ride-7");

    await render(<PickupDropEntry />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/rides/ride/ride-7"));

    await render(<PickupDropEntry />); // back on Home from the ride: no bounce
    expect(mockFindOpenRide).toHaveBeenCalledTimes(1);
  });

  test("a signed-out customer is not checked for an open ride", async () => {
    mockStatus = "signedOut";

    await render(<PickupDropEntry />);

    expect(mockFindOpenRide).not.toHaveBeenCalled();
  });

  test("a hidden card still lands the customer on a ride that is going", async () => {
    mockAvailability = { rides: false, parcel: false };
    mockFindOpenRide.mockResolvedValue("ride-9");

    await render(<PickupDropEntry />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/rides/ride/ride-9"));
  });
});

describe("what the server's answer means for Home (D21)", () => {
  it("decides each of ride and parcel by its own list", () => {
    expect(homeAvailability({ vehicle_types: ["BIKE"], parcel: [] })).toEqual({ rides: true, parcel: false });
    expect(homeAvailability({ vehicle_types: [], parcel: [{}] })).toEqual({ rides: false, parcel: true });
    expect(homeAvailability({ vehicle_types: [], parcel: [] })).toEqual({ rides: false, parcel: false });
  });

  it("keeps both while nothing is known: no location, loading, or an error", () => {
    expect(homeAvailability(undefined)).toEqual({ rides: true, parcel: true });
  });
});
