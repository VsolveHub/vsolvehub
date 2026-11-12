import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import { firstName, isOtpComplete, navigationUrl, tripStep } from "../model/trip";
import { TripScreen } from "./trip-screen";

const mockReplace = jest.fn();
const mockApi = {
  markArrived: jest.fn(),
  startTrip: jest.fn(),
  completeTrip: jest.fn(),
  markPaymentReceived: jest.fn(),
  cancelAsCaptain: jest.fn(),
  rateRider: jest.fn(),
  raiseCaptainSos: jest.fn(),
};
let mockRide: Record<string, unknown> | null;

class MockApiError extends Error {
  constructor(
    readonly code: string,
    readonly details: unknown,
  ) {
    super(code);
  }
}

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-maps", () => ({ __esModule: true, default: () => null, Marker: () => null }));
jest.mock("@/features/work/route", () => ({ isInAppMapAvailable: () => false }));
jest.mock("@vsolve/api-client", () => ({
  ...jest.requireActual("@vsolve/api-client"),
  isApiRequestError: (error: unknown) => error instanceof MockApiError,
}));
jest.mock("../queries", () => ({
  markArrived: (...args: unknown[]) => mockApi.markArrived(...args),
  startTrip: (...args: unknown[]) => mockApi.startTrip(...args),
  completeTrip: (...args: unknown[]) => mockApi.completeTrip(...args),
  markPaymentReceived: (...args: unknown[]) => mockApi.markPaymentReceived(...args),
  cancelAsCaptain: (...args: unknown[]) => mockApi.cancelAsCaptain(...args),
  rateRider: (...args: unknown[]) => mockApi.rateRider(...args),
  raiseCaptainSos: (...args: unknown[]) => mockApi.raiseCaptainSos(...args),
  captainStatusKey: ["rides", "me"],
  currentRideKey: ["rides", "ride", "current"],
  useCurrentRide: () => ({ isPending: false, data: { ride: mockRide } }),
}));

function ride(state: string, extra: Record<string, unknown> = {}) {
  return {
    id: "ride-1",
    state,
    vehicle_type: "BIKE",
    pickup: { latitude: "17.44", longitude: "78.35", address: "Gachibowli Stadium" },
    drop: { latitude: "17.45", longitude: "78.38", address: "Hitec City" },
    route_polyline: "",
    fare_paise: 5100,
    waiting_paise: 0,
    final_fare_paise: null,
    payment_method: "CASH_OR_UPI",
    payment_status: "DUE",
    rider: { name: "Priya Sharma", phone_number: "+919999900000" },
    ...extra,
  };
}

async function renderTrip() {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TripScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  for (const fn of Object.values(mockApi)) fn.mockReset();
  mockRide = ride("CAPTAIN_ASSIGNED");
});

describe("trip rules", () => {
  it("map each ride state to a trip screen", () => {
    expect(tripStep({ state: "CAPTAIN_ASSIGNED", payment_status: "DUE" })).toBe("to_pickup");
    expect(tripStep({ state: "CAPTAIN_ARRIVED", payment_status: "DUE" })).toBe("otp");
    expect(tripStep({ state: "IN_TRIP", payment_status: "DUE" })).toBe("in_trip");
    expect(tripStep({ state: "COMPLETED", payment_status: "DUE" })).toBe("collect");
    expect(tripStep({ state: "COMPLETED", payment_status: "COLLECTED" })).toBe("done");
  });

  it("open Google Maps turn-by-turn on Android", () => {
    expect(navigationUrl("17.44", "78.35", "android")).toBe("google.navigation:q=17.44,78.35");
    expect(navigationUrl(17.44, 78.35, "ios")).toContain("google.com/maps/dir");
    expect(firstName("Priya Sharma")).toBe("Priya");
    expect(isOtpComplete("123")).toBe(false);
    expect(isOtpComplete("1234")).toBe(true);
  });
});

test("to the pickup: the rider's first name, the place, and Arrived", async () => {
  mockApi.markArrived.mockResolvedValue(ride("CAPTAIN_ARRIVED"));
  const view = await renderTrip();

  expect(view.getByText("Pick up Priya")).toBeTruthy();
  expect(view.getByText("Gachibowli Stadium")).toBeTruthy();
  await fireEvent.press(view.getByText("I've arrived"));

  await waitFor(() => expect(mockApi.markArrived).toHaveBeenCalledWith("ride-1"));
});

test("a wrong start code says how many tries are left", async () => {
  mockRide = ride("CAPTAIN_ARRIVED");
  mockApi.startTrip.mockRejectedValue(new MockApiError("otp_invalid", { attempts_left: 2 }));
  const view = await renderTrip();

  expect(view.getByText("Start trip")).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText("Start code"), "12a34");
  await fireEvent.press(view.getByText("Start trip"));

  await waitFor(() => expect(view.getByText("That code is wrong. 2 tries left.")).toBeTruthy());
  expect(mockApi.startTrip).toHaveBeenCalledWith("ride-1", "1234");
});

test("collect, then rate the rider, then home", async () => {
  mockRide = ride("COMPLETED", { final_fare_paise: 5400, waiting_paise: 300 });
  mockApi.markPaymentReceived.mockResolvedValue(ride("COMPLETED", { payment_status: "COLLECTED" }));
  mockApi.rateRider.mockResolvedValue(undefined);
  const view = await renderTrip();

  expect(view.getByText("₹54")).toBeTruthy();
  expect(view.getByText("Fare ₹51 + waiting ₹3")).toBeTruthy();
  await fireEvent.press(view.getByText("Payment received"));

  await waitFor(() => expect(view.getByText("How was Priya?")).toBeTruthy());
  await fireEvent.press(view.getByLabelText("4 stars"));
  await fireEvent.press(view.getByText("Submit"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/rides"));
  expect(mockApi.rateRider).toHaveBeenCalledWith("ride-1", 4);
});

test("cancelling asks for a reason", async () => {
  mockApi.cancelAsCaptain.mockResolvedValue(undefined);
  const view = await renderTrip();

  await fireEvent.press(view.getByText("Cancel ride"));
  await fireEvent.press(view.getByText("Rider not reachable"));

  await waitFor(() => expect(mockApi.cancelAsCaptain).toHaveBeenCalledWith("ride-1", "RIDER_NOT_REACHABLE"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/rides"));
});

test("ending the trip asks first", async () => {
  mockRide = ride("IN_TRIP");
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const view = await renderTrip();

  expect(view.getByText("Hitec City")).toBeTruthy();
  await fireEvent.press(view.getByText("End trip"));

  expect(alert).toHaveBeenCalledWith("End the trip?", expect.any(String), expect.any(Array));
  expect(mockApi.completeTrip).not.toHaveBeenCalled();
  alert.mockRestore();
});

test("with no ride, says so and offers Home", async () => {
  mockRide = null;
  const view = await renderTrip();

  expect(view.getByText("You don't have a ride right now.")).toBeTruthy();
});
