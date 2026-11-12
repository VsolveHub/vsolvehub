import { fireEvent, render } from "@testing-library/react-native";

import { RideHistoryScreen } from "./RideHistoryScreen";

const mockPush = jest.fn();
let mockHistory: Record<string, unknown>;

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../queries", () => ({ useRideHistory: () => mockHistory }));

const ROW = {
  id: "ride-1",
  state: "COMPLETED",
  vehicle_type: "BIKE",
  pickup_address: "Alappuzha beach",
  drop_address: "Boat jetty",
  fare_paise: 4000,
  final_fare_paise: 4300,
  payment_status: "COLLECTED",
  created_at: "2026-11-11T10:00:00Z",
  completed_at: "2026-11-11T10:20:00Z",
  cancelled_by: "",
};

test("lists past rides with the final fare, and a tap opens the ride", async () => {
  mockHistory = { isPending: false, isError: false, isRefetching: false, data: { results: [ROW] } };
  const view = await render(<RideHistoryScreen />);

  expect(view.getByText("Bike · Completed")).toBeTruthy();
  expect(view.getByText("₹43")).toBeTruthy();
  await fireEvent.press(view.getByText("Alappuzha beach → Boat jetty"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/rides/ride/[rideId]",
    params: { rideId: "ride-1", from: "history" },
  });
});

test("says so when there are no rides yet", async () => {
  mockHistory = { isPending: false, isError: false, isRefetching: false, data: { results: [] } };
  expect((await render(<RideHistoryScreen />)).getByText("No rides yet")).toBeTruthy();
});
