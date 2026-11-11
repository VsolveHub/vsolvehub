import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { Alert } from "react-native";

import { canRiderCancel, etaText, rideStage, shareTripText } from "../ride-stage";
import { RideScreen } from "./RideScreen";

const mockReplace = jest.fn();
const mockCancel = jest.fn();
const mockRate = jest.fn();
const mockSos = jest.fn();
let mockRide: Record<string, unknown>;

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ rideId: "ride-1" }),
}));
jest.mock("react-native-maps", () => {
  const { Component } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  class MockMap extends Component<{ children?: unknown }> {
    fitToCoordinates() {}
    render() {
      return this.props.children ?? null;
    }
  }
  return { __esModule: true, default: MockMap, Marker: View, Polyline: View };
});
jest.mock("expo-location", () => ({ getForegroundPermissionsAsync: async () => ({ granted: false }) }));
jest.mock("../queries", () => ({
  cancelRide: (...args: unknown[]) => mockCancel(...args),
  rateCaptain: (...args: unknown[]) => mockRate(...args),
  raiseRiderSos: (...args: unknown[]) => mockSos(...args),
  rideKey: (id: string) => ["rides", "ride", id],
  useRide: () => ({ isPending: false, isError: false, data: mockRide, refetch: jest.fn() }),
}));

const CAPTAIN = {
  name: "Ravi",
  photo_url: null,
  rating: 4.6,
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
    route_polyline: "",
    emergency_number: "112",
    my_rating: null,
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
  mockRate.mockReset();
  mockSos.mockReset();
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

  it("say the ETA only when the server knows it", () => {
    expect(etaText(240)).toBe("Arriving in about 4 min");
    expect(etaText(null)).toBeNull();
  });

  it("share the captain's first name, the vehicle, pickup and drop", () => {
    const text = shareTripText({ ...ride("IN_TRIP"), captain: { ...CAPTAIN, name: "Ravi Kumar" } });
    expect(text).toContain("Captain: Ravi\n");
    expect(text).toContain("TS09TC0001 (Honda Shine, White)");
    expect(text).toContain("From: Alappuzha beach");
    expect(text).toContain("To: Boat jetty");
  });
});

test("searching, and searching again after a captain cancels", async () => {
  expect((await renderRide()).getByText("Finding your captain…")).toBeTruthy();

  mockRide = ride("SEARCHING", { searching_again: true });
  expect((await renderRide()).getByText("Finding another captain…")).toBeTruthy();
});

test("a captain on the way shows who is coming and the start code", async () => {
  mockRide = ride("CAPTAIN_ASSIGNED", { captain: { ...CAPTAIN, eta_s: 300 }, otp: "9062" });
  const view = await renderRide();

  expect(view.getByText("Ravi is on the way")).toBeTruthy();
  expect(view.getByText("Arriving in about 5 min")).toBeTruthy();
  expect(view.getByText(/★ 4\.6/)).toBeTruthy();
  expect(view.getByText("Call Ravi")).toBeTruthy();
  expect(view.getByText("TS09TC0001")).toBeTruthy();
  expect(view.getByText("9062")).toBeTruthy();
});

test("in the trip, no code and no cancel", async () => {
  mockRide = ride("IN_TRIP", { captain: CAPTAIN });
  const view = await renderRide();

  expect(view.getByText("On your way")).toBeTruthy();
  expect(view.queryByText("Cancel ride")).toBeNull();
  expect(view.getByText("SOS")).toBeTruthy();
  expect(view.getByText("Share")).toBeTruthy();
});

test("SOS asks first, then alerts support and offers the emergency number", async () => {
  mockRide = ride("IN_TRIP", { captain: CAPTAIN });
  mockSos.mockResolvedValue({ sos_id: "sos-1", emergency_number: "112" });
  const alert = jest.spyOn(Alert, "alert");
  const view = await renderRide();

  await fireEvent.press(view.getByText("SOS"));
  const confirm = alert.mock.calls[0]?.[2]?.find((b) => b.text === "Send SOS");
  confirm?.onPress?.();

  await waitFor(() => expect(mockSos).toHaveBeenCalledWith("ride-1", null));
  await waitFor(() => expect(alert).toHaveBeenCalledWith("SOS sent", expect.any(String), expect.any(Array)));
  alert.mockRestore();
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

test("after the trip, the rider rates the captain once", async () => {
  mockRide = ride("COMPLETED", { captain: CAPTAIN, final_fare_paise: 4300 });
  mockRate.mockResolvedValue(undefined);
  const view = await renderRide();

  await fireEvent.press(view.getByLabelText("4 stars"));
  await fireEvent.press(view.getByText("Submit rating"));

  await waitFor(() => expect(mockRate).toHaveBeenCalledWith("ride-1", 4));
});

test("an already rated ride says thanks instead of asking again", async () => {
  mockRide = ride("COMPLETED", { captain: CAPTAIN, my_rating: 5 });
  const view = await renderRide();
  expect(view.getByText("Thanks for rating your ride.")).toBeTruthy();
  expect(view.queryByText("Submit rating")).toBeNull();
});

test("cancelling asks for a reason", async () => {
  mockCancel.mockResolvedValue(ride("CANCELLED", { cancelled_by: "RIDER" }));
  const view = await renderRide();

  await fireEvent.press(view.getByText("Cancel ride"));
  await fireEvent.press(view.getByText("Changed my mind"));

  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("ride-1", "CHANGED_MIND"));
});
