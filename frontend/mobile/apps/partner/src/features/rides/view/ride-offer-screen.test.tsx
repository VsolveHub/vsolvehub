import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { RideOfferScreen } from "./ride-offer-screen";

const mockReplace = jest.fn();
const mockAccept = jest.fn();
const mockDecline = jest.fn();
const mockRing = jest.fn();
let mockOffer: Record<string, unknown> | null;
let mockRemainingMs = 12_000;

const OFFER = {
  id: "offer-1",
  ride_id: "ride-1",
  vehicle_type: "BIKE",
  pickup: { latitude: "17.44", longitude: "78.35", address: "Gachibowli Stadium" },
  drop: { latitude: "17.45", longitude: "78.38", address: "Hitec City" },
  pickup_distance_m: 640,
  fare_paise: 5100,
  trip_distance_m: 4200,
  trip_duration_s: 900,
  offered_at: "2026-11-11T10:00:00Z",
  expires_at: "2026-11-11T10:00:15Z",
};

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@vsolve/query/native", () => ({
  ...jest.requireActual("@vsolve/query/native"),
  useServerCountdown: (deadline: string | null) => (deadline ? { remainingMs: mockRemainingMs } : null),
}));
jest.mock("@/features/notifications/use-offer-ringtone", () => ({
  shouldRing: (status: string, seconds: number) => status === "PENDING" && seconds > 0,
  useOfferRingtone: (active: boolean) => {
    mockRing(active);
    return { silenced: false, silence: jest.fn() };
  },
}));
jest.mock("../queries", () => ({
  acceptOffer: (id: string) => mockAccept(id),
  declineOffer: (id: string) => mockDecline(id),
  captainStatusKey: ["rides", "me"],
  currentOfferKey: ["rides", "offer", "current"],
  currentRideKey: ["rides", "ride", "current"],
  useCurrentOffer: () => ({ isPending: false, data: { offer: mockOffer, server_now: "x" } }),
}));

async function renderOffer() {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RideOfferScreen offerId="offer-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockAccept.mockReset();
  mockDecline.mockReset().mockResolvedValue(undefined);
  mockRing.mockClear();
  mockOffer = OFFER;
  mockRemainingMs = 12_000;
});

test("shows the countdown, fare and places, and rings", async () => {
  const view = await renderOffer();

  expect(view.getByText("12 s")).toBeTruthy();
  expect(view.getByText("Bike")).toBeTruthy();
  expect(view.getByText("₹51")).toBeTruthy();
  expect(view.getByText("Gachibowli Stadium")).toBeTruthy();
  expect(view.getByText("Hitec City")).toBeTruthy();
  expect(view.getByText("0.6 km away")).toBeTruthy();
  expect(view.getByText("4.2 km · 15 min")).toBeTruthy();
  expect(mockRing).toHaveBeenLastCalledWith(true);
});

test("accepting takes the ride and opens the trip", async () => {
  mockAccept.mockResolvedValue({ id: "ride-1" });
  const view = await renderOffer();

  await fireEvent.press(view.getByText("Accept"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/rides/trip"));
  expect(mockAccept).toHaveBeenCalledWith("offer-1");
});

test("says so when another captain took it first", async () => {
  mockAccept.mockRejectedValue(new Error("This ride is no longer available."));
  const view = await renderOffer();

  await fireEvent.press(view.getByText("Accept"));

  await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
});

test("declining returns to Home", async () => {
  const view = await renderOffer();

  await fireEvent.press(view.getByText("Decline"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/rides"));
  expect(mockDecline).toHaveBeenCalledWith("offer-1");
});

test("an ended request stops ringing and says it has ended", async () => {
  mockRemainingMs = 0;
  const view = await renderOffer();

  expect(view.getByText("This ride request has ended.")).toBeTruthy();
  expect(mockRing).toHaveBeenLastCalledWith(false);

  mockOffer = null;
  mockRemainingMs = 12_000;
  expect((await renderOffer()).getByText("This ride request has ended.")).toBeTruthy();
});
