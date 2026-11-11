import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { RidesEntry, resetOpenRideCheck } from "./rides-entry";

const mockAvailability = { data: undefined as { vehicle_types: string[] } | undefined };
const mockPush = jest.fn();
const mockFindOpenRide = jest.fn();
let mockStatus = "signedIn";

jest.mock("./queries", () => ({
  useRidesAvailability: () => mockAvailability,
  findOpenRide: () => mockFindOpenRide(),
}));
jest.mock("@vsolve/mobile-core", () => ({
  useAuthStore: (select: (state: { status: string }) => unknown) => select({ status: mockStatus }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getLastKnownPositionAsync: jest.fn(async () => ({ coords: { latitude: 9.49, longitude: 76.33 } })),
  getCurrentPositionAsync: jest.fn(),
}));

beforeEach(() => {
  mockAvailability.data = undefined;
  mockPush.mockClear();
  mockFindOpenRide.mockReset().mockResolvedValue(null);
  mockStatus = "signedIn";
  resetOpenRideCheck();
});

test("reopening the app lands on the ride still going, once per launch", async () => {
  mockFindOpenRide.mockResolvedValue("ride-7");

  await render(<RidesEntry />);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/rides/ride/ride-7"));

  await render(<RidesEntry />); // back on Home from the ride: no bounce
  expect(mockFindOpenRide).toHaveBeenCalledTimes(1);
});

test("a signed-out customer is not checked for an open ride", async () => {
  mockStatus = "signedOut";
  await render(<RidesEntry />);
  expect(mockFindOpenRide).not.toHaveBeenCalled();
});

test("shows nothing while mockAvailability is unknown or empty", async () => {
  const loading = await render(<RidesEntry />);
  expect(loading.queryByText("Rides")).toBeNull();

  mockAvailability.data = { vehicle_types: [] };
  const empty = await render(<RidesEntry />);
  expect(empty.queryByText("Rides")).toBeNull();
});

test("lists only the vehicles available here, and opens Rides", async () => {
  mockAvailability.data = { vehicle_types: ["BIKE", "AUTO"] };

  const view = await render(<RidesEntry />);

  expect(view.getByText("Rides")).toBeTruthy();
  expect(view.getByText("Bike · Auto near you")).toBeTruthy();
  fireEvent.press(view.getByLabelText("Book a ride"));
  expect(mockPush).toHaveBeenCalledWith("/rides");
});
