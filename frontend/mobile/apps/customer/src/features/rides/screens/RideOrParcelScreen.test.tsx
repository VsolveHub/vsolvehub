import { fireEvent, render } from "@testing-library/react-native";

import { RideOrParcelScreen } from "./RideOrParcelScreen";

const mockPush = jest.fn();
let mockAvailability = { rides: true, parcel: true };

jest.mock("../use-home-availability", () => ({ useHomeAvailability: () => mockAvailability }));
jest.mock("@vsolve/mobile-core", () => ({
  useAuthStore: (select: (state: { status: string }) => unknown) => select({ status: "signedIn" }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockPush.mockClear();
  mockAvailability = { rides: true, parcel: true };
});

test("offers a ride and a parcel, each opening its own flow", async () => {
  const view = await render(<RideOrParcelScreen />);

  expect(view.getByText("Ride")).toBeTruthy();
  expect(view.getByText("Bike · Auto · Cab")).toBeTruthy();
  expect(view.getByText("Parcel")).toBeTruthy();
  expect(view.getByText("Send or get a parcel · Bike or Auto")).toBeTruthy();

  await fireEvent.press(view.getByLabelText("Book a ride"));
  expect(mockPush).toHaveBeenLastCalledWith("/rides");
  await fireEvent.press(view.getByLabelText("Send a parcel"));
  expect(mockPush).toHaveBeenLastCalledWith("/rides/parcel");
});

test("does not offer a ride where none can be booked", async () => {
  mockAvailability = { rides: false, parcel: true };

  const view = await render(<RideOrParcelScreen />);

  expect(view.queryByLabelText("Book a ride")).toBeNull();
  expect(view.getByLabelText("Send a parcel")).toBeTruthy();
});

test("does not offer a parcel where none can be booked", async () => {
  mockAvailability = { rides: true, parcel: false };

  const view = await render(<RideOrParcelScreen />);

  expect(view.getByLabelText("Book a ride")).toBeTruthy();
  expect(view.queryByLabelText("Send a parcel")).toBeNull();
});
