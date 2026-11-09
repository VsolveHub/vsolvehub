import { fireEvent, render } from "@testing-library/react-native";

import { RidesEntry } from "./rides-entry";

const mockAvailability = { data: undefined as { vehicle_types: string[] } | undefined };
const mockPush = jest.fn();

jest.mock("./queries", () => ({
  useRidesAvailability: () => mockAvailability,
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
