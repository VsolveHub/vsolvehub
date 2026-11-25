import { fireEvent, render } from "@testing-library/react-native";
import { Share } from "react-native";

import { canRiderCancel, rideStage } from "../ride-stage";
import { RideScreen } from "./RideScreen";

const mockReplace = jest.fn();
const mockCancel = jest.fn();
let mockRide: Record<string, unknown>;
const spies: jest.SpyInstance[] = [];

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
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-location", () => ({ getForegroundPermissionsAsync: async () => ({ granted: false }) }));
jest.mock("../queries", () => ({
  cancelRide: (...args: unknown[]) => mockCancel(...args),
  rateCaptain: jest.fn(),
  raiseRiderSos: jest.fn(),
  rideKey: (id: string) => ["rides", "ride", id],
  useRide: () => ({ isPending: false, isError: false, data: mockRide, refetch: jest.fn() }),
}));

const CAPTAIN = {
  name: "Ravi Kumar",
  photo_url: null,
  rating: 4.6,
  phone_number: "+919000077701",
  vehicle: { vehicle_type: "BIKE", registration_number: "TS09AB1234", make_model: "Honda Shine", colour: "White" },
  position: null,
  eta_s: null,
};

function parcelRide(state: string, extra: Record<string, unknown> = {}, parcel: Record<string, unknown> = {}) {
  return {
    id: "ride-1",
    kind: "PARCEL",
    state,
    vehicle_type: "BIKE",
    pickup: { latitude: "17.44", longitude: "78.35", address: "Gachibowli Stadium" },
    drop: { latitude: "17.45", longitude: "78.38", address: "Hitec City" },
    route_polyline: "",
    emergency_number: "112",
    my_rating: null,
    fare_paise: 5100,
    final_fare_paise: null,
    captain: null,
    otp: null,
    searching_again: false,
    cancelled_by: "",
    cancel_reason: "",
    parcel: {
      mode: "SEND",
      payer: "SENDER",
      pin_required: true,
      payment_point: "PICKUP",
      arrived_at_drop_at: null,
      return_fare_paise: null,
      return_payment_status: null,
      delivery_pin: null,
      ...parcel,
    },
    ...extra,
  };
}

async function renderRide() {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <RideScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockCancel.mockReset();
  mockRide = parcelRide("SEARCHING");
});

afterEach(() => {
  while (spies.length) spies.pop()?.mockRestore();
});

describe("the stages of a parcel", () => {
  it("keeps the booker's polling and cancel rules for the new states", () => {
    expect(rideStage("RETURNING")).toBe("returning");
    expect(rideStage("RETURNED")).toBe("returned");
    expect(canRiderCancel("returning")).toBe(false); // no cancel once it is picked up (D15)
    expect(canRiderCancel("returned")).toBe(false);
  });

  it("says it is looking for a captain", async () => {
    const view = await renderRide();

    expect(view.getByText("Finding your captain…")).toBeTruthy();
    expect(view.getByText("Finding a captain")).toBeTruthy();
  });

  it("shows the codes card with the pickup code and the delivery PIN, once a captain is coming", async () => {
    mockRide = parcelRide("CAPTAIN_ASSIGNED", { captain: CAPTAIN, otp: "4821" }, { delivery_pin: "7305" });
    const view = await renderRide();

    expect(view.getByText("Ravi Kumar is on the way")).toBeTruthy();
    expect(view.getByText("Captain on the way")).toBeTruthy();
    expect(view.getByText("Pickup code")).toBeTruthy();
    expect(view.getByText("4821")).toBeTruthy();
    expect(view.getByText("Delivery PIN")).toBeTruthy();
    expect(view.getByText("7305")).toBeTruthy();
    expect(view.queryByText("Start code")).toBeNull(); // a ride's wording is not used
  });

  it("lists no delivery PIN when PIN confirmation is off", async () => {
    mockRide = parcelRide("CAPTAIN_ASSIGNED", { captain: CAPTAIN, otp: "4821" }, { pin_required: false, delivery_pin: null });
    const view = await renderRide();

    expect(view.getByText("4821")).toBeTruthy();
    expect(view.queryByText("Delivery PIN")).toBeNull();
  });

  it("shares each code with a ready-made message", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });
    spies.push(share);
    mockRide = parcelRide("CAPTAIN_ASSIGNED", { captain: CAPTAIN, otp: "4821" }, { delivery_pin: "7305" });
    const view = await renderRide();

    await fireEvent.press(view.getByLabelText("Share Pickup code"));
    await fireEvent.press(view.getByLabelText("Share Delivery PIN"));

    expect(share).toHaveBeenNthCalledWith(1, {
      message: "V Solve Hub Pick up & Drop: Ravi Kumar, Honda Shine TS09AB1234. Pickup code 4821",
    });
    expect(share).toHaveBeenNthCalledWith(2, {
      message: "V Solve Hub Pick up & Drop: Ravi Kumar, Honda Shine TS09AB1234. Delivery PIN 7305",
    });
  });

  it("tells the drop to pay first when the receiver pays", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });
    spies.push(share);
    mockRide = parcelRide(
      "CAPTAIN_ASSIGNED",
      { captain: CAPTAIN, otp: "4821" },
      { payer: "RECEIVER", payment_point: "DROP", delivery_pin: "7305" },
    );
    const view = await renderRide();

    await fireEvent.press(view.getByLabelText("Share Delivery PIN"));

    expect(share).toHaveBeenCalledWith({
      message:
        "V Solve Hub Pick up & Drop: Ravi Kumar, Honda Shine TS09AB1234. Delivery PIN 7305. " +
        "Please pay ₹51 in cash or UPI to the captain before you take the item.",
    });
  });

  it("says who pays and where, instead of 'cash to your captain'", async () => {
    mockRide = parcelRide("CAPTAIN_ASSIGNED", { captain: CAPTAIN, otp: "4821" }, { payer: "RECEIVER", payment_point: "DROP" });
    const view = await renderRide();

    expect(view.getByText("Receiver pays the captain at the drop")).toBeTruthy();
    expect(view.queryByText("Cash or UPI to your captain")).toBeNull();
  });

  it("has no Share trip button: each code has its own Share", async () => {
    mockRide = parcelRide("CAPTAIN_ASSIGNED", { captain: CAPTAIN, otp: "4821" });
    const view = await renderRide();

    // One Share for the one code listed (the pickup code), and none for "Share trip".
    expect(view.getAllByText("Share")).toHaveLength(1);
    expect(view.getByText("SOS")).toBeTruthy();
  });

  it("names picked up and at the drop", async () => {
    mockRide = parcelRide("IN_TRIP", { captain: CAPTAIN }, { delivery_pin: "7305" });
    const picked = await renderRide();
    expect(picked.getByText("Picked up")).toBeTruthy();
    expect(picked.getByText("Your parcel is on its way")).toBeTruthy();
    expect(picked.queryByText("Pickup code")).toBeNull(); // the server has stopped sending it

    mockRide = parcelRide("IN_TRIP", { captain: CAPTAIN }, { arrived_at_drop_at: "2026-11-23T10:00:00Z", delivery_pin: "7305" });
    const atDrop = await renderRide();
    expect(atDrop.getByText("At drop")).toBeTruthy();
    expect(atDrop.getByText("Your parcel is at the drop")).toBeTruthy();
    expect(atDrop.getByText("7305")).toBeTruthy();
  });

  it("cannot be cancelled once picked up", async () => {
    mockRide = parcelRide("IN_TRIP", { captain: CAPTAIN });

    expect((await renderRide()).queryByText("Cancel ride")).toBeNull();
  });

  it("can be cancelled while a captain is coming", async () => {
    mockRide = parcelRide("CAPTAIN_ASSIGNED", { captain: CAPTAIN, otp: "4821" });

    expect((await renderRide()).getByText("Cancel ride")).toBeTruthy();
  });
});

describe("the way back", () => {
  it("shows the pickup code again, the return fare, and keeps the map", async () => {
    mockRide = parcelRide(
      "RETURNING",
      { captain: CAPTAIN, otp: "4821", final_fare_paise: 8100 },
      { return_fare_paise: 3000, return_payment_status: "DUE" },
    );
    const view = await renderRide();

    expect(view.getByText("Your parcel is coming back")).toBeTruthy();
    expect(view.getByText("Returning")).toBeTruthy();
    expect(view.getByText("4821")).toBeTruthy();
    expect(view.getByText("For the person at the pickup, to take the parcel back")).toBeTruthy();
    expect(view.getByText("Includes the return trip")).toBeTruthy();
    expect(view.getByText("₹30")).toBeTruthy();
    expect(view.queryByText("Cancel ride")).toBeNull();
  });

  it("ends with Parcel returned", async () => {
    mockRide = parcelRide("RETURNED", { captain: CAPTAIN }, { return_fare_paise: 3000 });
    const view = await renderRide();

    expect(view.getByText("Parcel returned")).toBeTruthy();
    expect(view.getByText("Your parcel is back at the pickup.")).toBeTruthy();
    fireEvent.press(view.getByText("Done"));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});

describe("how it ends", () => {
  it("is Parcel delivered, with a rating sheet that is about the delivery and not payment", async () => {
    mockRide = parcelRide("COMPLETED", { captain: CAPTAIN, final_fare_paise: 5300 });
    const view = await renderRide();

    expect(view.getByText("Parcel delivered")).toBeTruthy();
    expect(view.getByText("Rate your captain")).toBeTruthy();
    expect(view.getByText("How was the delivery?")).toBeTruthy();
    expect(view.queryByText("Pay your captain")).toBeNull();
  });

  it("explains when the captain could not take the item, and that nobody was charged", async () => {
    mockRide = parcelRide("CANCELLED", { cancelled_by: "CAPTAIN", cancel_reason: "ITEM_NOT_ALLOWED" });
    const view = await renderRide();

    expect(view.getByText("Parcel not taken")).toBeTruthy();
    expect(
      view.getByText(
        "Your captain couldn't take this item because it doesn't follow the package guidelines. You were not charged.",
      ),
    ).toBeTruthy();
  });

  it("says who cancelled", async () => {
    mockRide = parcelRide("CANCELLED", { cancelled_by: "RIDER", cancel_reason: "CHANGED_MIND" });
    const you = await renderRide();
    expect(you.getByText("You cancelled this parcel.")).toBeTruthy();

    mockRide = parcelRide("CANCELLED", { cancelled_by: "OPERATIONS", cancel_reason: "x" });
    const support = await renderRide();
    expect(support.getByText("VSolve support cancelled this parcel.")).toBeTruthy();
  });

  it("goes back to choosing a parcel vehicle after No captain nearby", async () => {
    mockRide = parcelRide("NO_CAPTAIN_FOUND");
    const view = await renderRide();

    await fireEvent.press(view.getByText("Try again"));

    expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/rides/parcel/choose" }));
  });
});

describe("a ride is unchanged", () => {
  it("still uses its own words and the start code", async () => {
    mockRide = {
      ...parcelRide("CAPTAIN_ASSIGNED", { captain: CAPTAIN, otp: "4821" }),
      kind: "RIDE",
      parcel: null,
    };
    const view = await renderRide();

    expect(view.getByText("Start code")).toBeTruthy();
    expect(view.queryByText("Pickup code")).toBeNull();
    expect(view.getByText("Share")).toBeTruthy();
    expect(view.getByText("Cash or UPI to your captain")).toBeTruthy();
  });
});
