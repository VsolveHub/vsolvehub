import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Animated, Keyboard } from "react-native";

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

// The progress bar's slide, finished at once: no timers left running, and we can see where it went.
const slide = jest.spyOn(Animated, "timing");

beforeEach(() => {
  slide.mockReset().mockReturnValue({ start: (done?: (r: { finished: boolean }) => void) => done?.({ finished: true }) } as never);
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
    expect(firstName("")).toBe("Rider");
    expect(firstName("   ")).toBe("Rider");
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

test("shows where the captain is in the ride, the fare, and Navigate, Call and SOS together", async () => {
  const view = await renderTrip();

  for (const label of ["Pickup", "Code", "Trip", "Payment", "Rate"]) expect(view.getByText(label)).toBeTruthy();
  expect(view.getByText("₹51")).toBeTruthy();
  expect(view.getByText("Navigate")).toBeTruthy();
  expect(view.getByText("Call Priya")).toBeTruthy();
  expect(view.getByText("SOS")).toBeTruthy();
});

test("is one page from pickup to review: the bar and both addresses stay as the steps change", async () => {
  const steps: [string, Record<string, unknown>][] = [
    ["CAPTAIN_ASSIGNED", {}],
    ["CAPTAIN_ARRIVED", {}],
    ["IN_TRIP", {}],
    ["COMPLETED", { payment_status: "DUE" }],
  ];
  for (const [state, extra] of steps) {
    mockRide = ride(state, extra);
    const view = await renderTrip();

    for (const label of ["Pickup", "Code", "Trip", "Payment", "Rate"]) expect(view.getByText(label)).toBeTruthy();
    expect(view.getByText("Gachibowli Stadium")).toBeTruthy();
    expect(view.getByText("Hitec City")).toBeTruthy();
    await view.unmount();
  }
});

test("with the keyboard open at the start code, the big icon steps aside and the code box stays", async () => {
  const handlers: Record<string, () => void> = {};
  const spy = jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, handler: () => void) => {
    handlers[event] = handler;
    return { remove: jest.fn() };
  }) as never);
  mockRide = ride("CAPTAIN_ARRIVED");
  const view = await renderTrip();
  expect(view.getByTestId("step-visual")).toBeTruthy();

  await act(async () => handlers.keyboardDidShow?.());

  expect(view.queryByTestId("step-visual")).toBeNull(); // the sheet gets the room
  expect(view.getByLabelText("Start code")).toBeTruthy(); // and the code box is still there
  expect(view.getByText("Start trip")).toBeTruthy(); // with its button
  // Only the input and the button while typing: the route and the actions come back after.
  expect(view.queryByText("Gachibowli Stadium")).toBeNull();
  expect(view.queryByText("Cancel ride")).toBeNull();

  await act(async () => handlers.keyboardDidHide?.());
  expect(view.getByTestId("step-visual")).toBeTruthy();
  expect(view.getByText("Gachibowli Stadium")).toBeTruthy();
  expect(view.getByText("Cancel ride")).toBeTruthy();
  spy.mockRestore();
});

test("the progress bar moves to the current step", async () => {
  const wanted: [string, number][] = [
    ["CAPTAIN_ASSIGNED", 1],
    ["CAPTAIN_ARRIVED", 2],
    ["IN_TRIP", 3],
  ];
  for (const [state, filled] of wanted) {
    slide.mockClear();
    mockRide = ride(state);
    const view = await renderTrip();
    expect(slide).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: filled }));
    await view.unmount();
  }
});

test("the review is on the same page too: stars, Submit and Skip, with the bar complete", async () => {
  mockApi.markPaymentReceived.mockResolvedValue(ride("COMPLETED", { payment_status: "PAID" }));
  mockRide = ride("COMPLETED", { payment_status: "DUE" });
  const view = await renderTrip();

  await fireEvent.press(view.getByText("Payment received"));

  await waitFor(() => expect(view.getByText("How was Priya?")).toBeTruthy());
  expect(view.getByText("Rate")).toBeTruthy(); // the last step of the same bar
  expect(view.getByText("Gachibowli Stadium")).toBeTruthy(); // the trip is still on the page
  expect(view.getByText("Skip")).toBeTruthy();
});

test("at the start code there is nowhere to navigate to", async () => {
  mockRide = ride("CAPTAIN_ARRIVED");
  const view = await renderTrip();

  expect(view.queryByText("Navigate")).toBeNull();
  expect(view.getByText("Call Priya")).toBeTruthy();
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
