import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { RidesEntry, resetOpenRideCheck } from "./rides-entry";

const mockPush = jest.fn();
const mockFindOpenRide = jest.fn();
let mockStatus = "signedIn";

jest.mock("./queries", () => ({ findOpenRide: () => mockFindOpenRide() }));
jest.mock("@vsolve/mobile-core", () => ({
  useAuthStore: (select: (state: { status: string }) => unknown) => select({ status: mockStatus }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
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

test("a signed-in customer always sees the card, with no location check, and opens Rides", async () => {
  const view = await render(<RidesEntry />);

  expect(view.getByText("Rides")).toBeTruthy();
  expect(view.getByText("Bike · Auto · Cab")).toBeTruthy();
  fireEvent.press(view.getByLabelText("Book a ride"));
  expect(mockPush).toHaveBeenCalledWith("/rides");
});

test("a signed-out customer sees no Rides card", async () => {
  mockStatus = "signedOut";
  const view = await render(<RidesEntry />);
  expect(view.queryByText("Rides")).toBeNull();
});
