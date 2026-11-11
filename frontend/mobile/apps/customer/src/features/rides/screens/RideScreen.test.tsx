import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { canRiderCancel, rideStage } from "../ride-stage";
import { RideScreen } from "./RideScreen";

const mockReplace = jest.fn();
const mockCancel = jest.fn();
let mockRide: Record<string, unknown>;

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ rideId: "ride-1" }),
}));
jest.mock("../queries", () => ({
  cancelRide: (...args: unknown[]) => mockCancel(...args),
  rideKey: (id: string) => ["rides", "ride", id],
  useRide: () => ({ isPending: false, isError: false, data: mockRide, refetch: jest.fn() }),
}));

const CAPTAIN = {
  name: "Ravi",
  photo_url: null,
  phone_number: "+919000077701",
  vehicle: { vehicle_type: "BIKE", registration_number: "TS09TC0001", make_model: "Honda Shine", colour: "White" },
  position: null,
  eta_s: null,
};

function ride(state: string, extra: Record<string, unknown> = {}) {
  return {
    id: "ride-1",
    state,
    vehicle_type: "BIKE",
    pickup: { latitude: "9.48", longitude: "76.34", address: "Alappuzha beach" },
    drop: { latitude: "9.50", longitude: "76.34", address: "Boat jetty" },
    fare_paise: 4000,
    final_fare_paise: null,
    captain: null,
    otp: null,
    searching_again: false,
    cancelled_by: "",
    ...extra,
  };
}

async function renderRide() {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RideScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockCancel.mockReset();
  mockRide = ride("SEARCHING");
});

describe("ride stages", () => {
  it("follow the ride state, and the rider can cancel only before the trip", () => {
    expect(rideStage("SEARCHING")).toBe("searching");
    expect(rideStage("NO_CAPTAIN_FOUND")).toBe("no_captain");
    expect(rideStage("COMPLETED")).toBe("pay");
    expect(canRiderCancel("arrived")).toBe(true);
    expect(canRiderCancel("in_trip")).toBe(false);
  });
});

test("searching, and searching again after a captain cancels", async () => {
  expect((await renderRide()).getByText("Finding your captain…")).toBeTruthy();

  mockRide = ride("SEARCHING", { searching_again: true });
  expect((await renderRide()).getByText("Finding another captain…")).toBeTruthy();
});

test("a captain on the way shows who is coming and the start code", async () => {
  mockRide = ride("CAPTAIN_ASSIGNED", { captain: CAPTAIN, otp: "9062" });
  const view = await renderRide();

  expect(view.getByText("Ravi is on the way")).toBeTruthy();
  expect(view.getByText("TS09TC0001")).toBeTruthy();
  expect(view.getByText("9062")).toBeTruthy();
});

test("in the trip, no code and no cancel", async () => {
  mockRide = ride("IN_TRIP", { captain: CAPTAIN });
  const view = await renderRide();

  expect(view.getByText("On your way")).toBeTruthy();
  expect(view.queryByText("Cancel ride")).toBeNull();
});

test("no captain nearby offers to try again for the same trip", async () => {
  mockRide = ride("NO_CAPTAIN_FOUND");
  const view = await renderRide();

  await fireEvent.press(view.getByText("Try again"));

  expect(mockReplace).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: "/rides/choose-ride",
      params: expect.objectContaining({ pickupLabel: "Alappuzha beach", dropLabel: "Boat jetty" }),
    }),
  );
});

test("after the trip, says what to pay the captain", async () => {
  mockRide = ride("COMPLETED", { captain: CAPTAIN, final_fare_paise: 4300 });
  expect((await renderRide()).getByText("Pay ₹43 to your captain")).toBeTruthy();
});

test("cancelling asks for a reason", async () => {
  mockCancel.mockResolvedValue(ride("CANCELLED", { cancelled_by: "RIDER" }));
  const view = await renderRide();

  await fireEvent.press(view.getByText("Cancel ride"));
  await fireEvent.press(view.getByText("Changed my mind"));

  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("ride-1", "CHANGED_MIND"));
});
