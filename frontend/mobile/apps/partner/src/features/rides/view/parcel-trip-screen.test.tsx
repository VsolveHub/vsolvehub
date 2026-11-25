import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";

import { ParcelTripScreen } from "./parcel-trip-screen";

const mockReplace = jest.fn();
const mockApi = {
  markArrived: jest.fn(),
  startTrip: jest.fn(),
  markArrivedAtDrop: jest.fn(),
  markPaymentReceived: jest.fn(),
  markPaymentNotReceived: jest.fn(),
  deliverParcel: jest.fn(),
  markReceiverUnavailable: jest.fn(),
  returnParcel: jest.fn(),
  cancelAsCaptain: jest.fn(),
  raiseCaptainSos: jest.fn(),
};
let mockRide: Record<string, unknown> | null;
let mockWait: { remainingMs: number; isExpired: boolean; display: string } | null;

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
jest.mock("@vsolve/query/native", () => ({
  ...jest.requireActual("@vsolve/query/native"),
  useServerCountdown: () => mockWait,
}));
jest.mock("@vsolve/api-client", () => ({
  ...jest.requireActual("@vsolve/api-client"),
  isApiRequestError: (error: unknown) => error instanceof MockApiError,
}));
jest.mock("../queries", () => ({
  markArrived: (...a: unknown[]) => mockApi.markArrived(...a),
  startTrip: (...a: unknown[]) => mockApi.startTrip(...a),
  markArrivedAtDrop: (...a: unknown[]) => mockApi.markArrivedAtDrop(...a),
  markPaymentReceived: (...a: unknown[]) => mockApi.markPaymentReceived(...a),
  markPaymentNotReceived: (...a: unknown[]) => mockApi.markPaymentNotReceived(...a),
  deliverParcel: (...a: unknown[]) => mockApi.deliverParcel(...a),
  markReceiverUnavailable: (...a: unknown[]) => mockApi.markReceiverUnavailable(...a),
  returnParcel: (...a: unknown[]) => mockApi.returnParcel(...a),
  cancelAsCaptain: (...a: unknown[]) => mockApi.cancelAsCaptain(...a),
  raiseCaptainSos: (...a: unknown[]) => mockApi.raiseCaptainSos(...a),
  captainStatusKey: ["rides", "me"],
  currentRideKey: ["rides", "ride", "current"],
  useCurrentRide: () => ({ isPending: false, data: { ride: mockRide } }),
}));

function parcelRide(state: string, extra: Record<string, unknown> = {}, parcel: Record<string, unknown> = {}) {
  return {
    id: "ride-1",
    kind: "PARCEL",
    state,
    vehicle_type: "BIKE",
    pickup: { latitude: "17.44", longitude: "78.35", address: "Gachibowli Stadium" },
    drop: { latitude: "17.45", longitude: "78.38", address: "Hitec City" },
    route_polyline: "",
    fare_paise: 5100,
    waiting_paise: 0,
    final_fare_paise: null,
    payment_status: "DUE",
    rider: { name: "Priya Sharma", phone_number: "+919999900000" },
    parcel: {
      mode: "SEND",
      payer: "SENDER",
      pin_required: true,
      pickup: { name: "Ravi Kumar", phone: "9123456780", building: "Sky Towers", unit: "4B", meet_at: "CURB", instructions: "" },
      drop: { name: "Asha Rao", phone: "9876543210", building: "Green Villas", unit: "", meet_at: "DOOR", instructions: "Ring twice" },
      payment_point: "PICKUP",
      arrived_at_drop_at: null,
      delivered_at: null,
      receiver_unavailable_at: null,
      returned_at: null,
      return_fare_paise: null,
      return_payment_status: null,
      receiver_unavailable_allowed_at: null,
      ...parcel,
    },
    ...extra,
  };
}

const AT_DROP = { arrived_at_drop_at: "2026-11-23T10:00:00Z" };

async function renderParcel() {
  const { QueryClient, QueryClientProvider } = jest.requireActual("@tanstack/react-query");
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ParcelTripScreen />
    </QueryClientProvider>,
  );
}

// Only the spies made here are undone after each test: restoring everything would also wipe React
// Native's own mocks (the keyboard listener the screen uses).
const spies: jest.SpyInstance[] = [];

/** Press the button of an Alert by its label, as a person would. */
function confirmAlert(label: string) {
  spies.push(
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === label)?.onPress?.();
    }),
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  for (const fn of Object.values(mockApi)) fn.mockReset();
  mockRide = parcelRide("CAPTAIN_ASSIGNED");
  mockWait = null;
});

afterEach(() => {
  while (spies.length) spies.pop()?.mockRestore();
});

describe("the way to the pickup", () => {
  it("shows the sender, both ends, how to meet them and a way to call", async () => {
    const view = await renderParcel();

    expect(view.getByText("Go to the pickup")).toBeTruthy();
    expect(view.getByText("Pick up from Ravi")).toBeTruthy();
    for (const text of ["Gachibowli Stadium", "Ravi Kumar", "Sky Towers · 4B", "Meet at curb"]) {
      expect(view.getByText(text)).toBeTruthy();
    }
    for (const text of ["Hitec City", "Asha Rao", "Green Villas", "Meet at door", "Ring twice"]) {
      expect(view.getByText(text)).toBeTruthy();
    }
    expect(view.getByLabelText("Call Ravi")).toBeTruthy();
    expect(view.getByLabelText("Call Asha")).toBeTruthy();
    // "Pickup" and "Drop" are both a progress step and the title of an end, so they appear twice.
    for (const label of ["Pickup", "Code", "Drop", "Hand over", "Done"]) {
      expect(view.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("calls the person with India's code added", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    spies.push(open);
    const view = await renderParcel();

    await fireEvent.press(view.getByLabelText("Call Asha"));

    expect(open).toHaveBeenCalledWith("tel:+919876543210");
  });

  it("tells the server the captain has arrived", async () => {
    mockApi.markArrived.mockResolvedValue(parcelRide("CAPTAIN_ARRIVED"));
    const view = await renderParcel();

    await fireEvent.press(view.getByText("I've arrived"));

    await waitFor(() => expect(mockApi.markArrived).toHaveBeenCalledWith("ride-1"));
  });
});

describe("the pickup code, and Can't take this item", () => {
  beforeEach(() => {
    mockRide = parcelRide("CAPTAIN_ARRIVED");
  });

  it("needs four digits before the parcel is picked up", async () => {
    mockApi.startTrip.mockResolvedValue(parcelRide("IN_TRIP"));
    const view = await renderParcel();

    await fireEvent.changeText(view.getByLabelText("Pickup code"), "12ab3");
    await fireEvent.press(view.getByText("Pick up the parcel"));
    expect(mockApi.startTrip).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByLabelText("Pickup code"), "1234");
    await fireEvent.press(view.getByText("Pick up the parcel"));
    await waitFor(() => expect(mockApi.startTrip).toHaveBeenCalledWith("ride-1", "1234"));
  });

  it("says how many tries are left after a wrong code", async () => {
    mockApi.startTrip.mockRejectedValue(new MockApiError("otp_invalid", { attempts_left: 3 }));
    const view = await renderParcel();

    await fireEvent.changeText(view.getByLabelText("Pickup code"), "9999");
    await fireEvent.press(view.getByText("Pick up the parcel"));

    expect(await view.findByText("That code is wrong. 3 tries left.")).toBeTruthy();
  });

  it("refuses the item with the one reason the server knows, after a confirmation", async () => {
    mockApi.cancelAsCaptain.mockResolvedValue(undefined);
    confirmAlert("Can't take it");
    const view = await renderParcel();

    await fireEvent.press(view.getByText("Can't take this item"));

    await waitFor(() => expect(mockApi.cancelAsCaptain).toHaveBeenCalledWith("ride-1", "ITEM_NOT_ALLOWED"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/rides"));
  });

  it("does nothing when the captain backs out of the confirmation", async () => {
    confirmAlert("Not now");
    const view = await renderParcel();

    await fireEvent.press(view.getByText("Can't take this item"));

    expect(mockApi.cancelAsCaptain).not.toHaveBeenCalled();
  });

  it("keeps the ordinary cancel with its reasons, and no other way to refuse", async () => {
    const view = await renderParcel();

    await fireEvent.press(view.getByText("Cancel"));

    expect(view.getByText("Why are you cancelling?")).toBeTruthy();
    expect(view.getByText("Vehicle problem")).toBeTruthy();
  });
});

describe("collecting the sender's money", () => {
  beforeEach(() => {
    mockRide = parcelRide("IN_TRIP", { final_fare_paise: 5300 });
  });

  it("asks for the fixed fare right after pickup and marks it received", async () => {
    mockApi.markPaymentReceived.mockResolvedValue(parcelRide("IN_TRIP", { payment_status: "COLLECTED" }));
    const view = await renderParcel();

    expect(view.getByText("Collect the payment")).toBeTruthy();
    expect(view.getByText("From Ravi")).toBeTruthy();
    expect(view.getByText("₹53")).toBeTruthy();
    await fireEvent.press(view.getByText("Payment received"));

    await waitFor(() => expect(mockApi.markPaymentReceived).toHaveBeenCalledWith("ride-1"));
  });

  it("lets the captain carry on to the drop and collect later", async () => {
    const view = await renderParcel();

    await fireEvent.press(view.getByText("Collect later"));

    expect(await view.findByText("Take it to the drop")).toBeTruthy();
    expect(mockApi.markPaymentReceived).not.toHaveBeenCalled();
  });

  it("goes straight to the drop when the sender has already paid", async () => {
    mockRide = parcelRide("IN_TRIP", { payment_status: "COLLECTED" });
    const view = await renderParcel();

    expect(view.getByText("Take it to the drop")).toBeTruthy();
    expect(view.getByText("Deliver to Asha")).toBeTruthy();
  });

  it("marks arriving at the drop", async () => {
    mockRide = parcelRide("IN_TRIP", { payment_status: "COLLECTED" });
    mockApi.markArrivedAtDrop.mockResolvedValue(parcelRide("IN_TRIP", { payment_status: "COLLECTED" }, AT_DROP));
    const view = await renderParcel();

    await fireEvent.press(view.getByText("I've arrived at the drop"));

    await waitFor(() => expect(mockApi.markArrivedAtDrop).toHaveBeenCalledWith("ride-1"));
  });
});

describe("the receiver pays", () => {
  it("collects first, and offers nothing to hand over until the money is in", async () => {
    mockRide = parcelRide("IN_TRIP", { final_fare_paise: 5300 }, { payer: "RECEIVER", ...AT_DROP });
    mockApi.markPaymentReceived.mockResolvedValue(
      parcelRide("IN_TRIP", { payment_status: "COLLECTED" }, { payer: "RECEIVER", ...AT_DROP }),
    );
    const view = await renderParcel();

    expect(view.getByText("Collect before you hand over")).toBeTruthy();
    expect(view.getByText("From Asha")).toBeTruthy();
    expect(view.queryByText("Deliver")).toBeNull();
    expect(view.queryByText("Delivered")).toBeNull();
    await fireEvent.press(view.getByText("Payment received"));

    await waitFor(() => expect(mockApi.markPaymentReceived).toHaveBeenCalledWith("ride-1"));
  });
});

describe("handing over", () => {
  it("asks for the PIN, and Deliver waits for four digits", async () => {
    mockRide = parcelRide("IN_TRIP", { payment_status: "COLLECTED" }, AT_DROP);
    mockApi.deliverParcel.mockResolvedValue(parcelRide("COMPLETED", { payment_status: "COLLECTED" }, AT_DROP));
    const view = await renderParcel();

    expect(view.getByText("Ask for the delivery PIN")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Delivery PIN"), "43");
    await fireEvent.press(view.getByText("Deliver"));
    expect(mockApi.deliverParcel).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByLabelText("Delivery PIN"), "4321");
    await fireEvent.press(view.getByText("Deliver"));
    await waitFor(() => expect(mockApi.deliverParcel).toHaveBeenCalledWith("ride-1", "4321"));
  });

  it("says how many tries are left after a wrong PIN", async () => {
    mockRide = parcelRide("IN_TRIP", { payment_status: "COLLECTED" }, AT_DROP);
    mockApi.deliverParcel.mockRejectedValue(new MockApiError("pin_invalid", { attempts_left: 1 }));
    const view = await renderParcel();

    await fireEvent.changeText(view.getByLabelText("Delivery PIN"), "0000");
    await fireEvent.press(view.getByText("Deliver"));

    expect(await view.findByText("That PIN is wrong. 1 try left.")).toBeTruthy();
  });

  it("is just Delivered when PIN confirmation is off", async () => {
    mockRide = parcelRide("IN_TRIP", { payment_status: "COLLECTED" }, { pin_required: false, ...AT_DROP });
    mockApi.deliverParcel.mockResolvedValue(parcelRide("COMPLETED", { payment_status: "COLLECTED" }, AT_DROP));
    confirmAlert("Delivered");
    const view = await renderParcel();

    expect(view.queryByLabelText("Delivery PIN")).toBeNull();
    await fireEvent.press(view.getByText("Delivered"));

    await waitFor(() => expect(mockApi.deliverParcel).toHaveBeenCalledWith("ride-1", undefined));
  });

  it("keeps Receiver not available shut, with the time left, until the server says so", async () => {
    mockRide = parcelRide("IN_TRIP", { payment_status: "COLLECTED" }, AT_DROP);
    mockWait = { remainingMs: 150_000, isExpired: false, display: "2:30" };
    const view = await renderParcel();

    await fireEvent.press(view.getByText("Receiver not available (in 2:30)"));

    expect(mockApi.markReceiverUnavailable).not.toHaveBeenCalled();
  });

  it("opens Receiver not available once the wait is over, and takes the parcel back", async () => {
    mockRide = parcelRide("IN_TRIP", { payment_status: "COLLECTED" }, AT_DROP);
    mockWait = { remainingMs: 0, isExpired: true, display: "0:00" };
    mockApi.markReceiverUnavailable.mockResolvedValue(parcelRide("RETURNING", { payment_status: "COLLECTED" }));
    confirmAlert("Take it back");
    const view = await renderParcel();

    await fireEvent.press(view.getByText("Receiver not available"));

    await waitFor(() => expect(mockApi.markReceiverUnavailable).toHaveBeenCalledWith("ride-1"));
  });
});

describe("taking it back", () => {
  it("goes to the pickup, shows the return fare and asks the sender's code", async () => {
    mockRide = parcelRide("RETURNING", { payment_status: "COLLECTED" }, { return_fare_paise: 3000, return_payment_status: "DUE" });
    mockApi.returnParcel.mockResolvedValue(parcelRide("RETURNED"));
    const view = await renderParcel();

    expect(view.getByText("Take it back to the pickup")).toBeTruthy();
    expect(view.getByText("Return it to Ravi")).toBeTruthy();
    expect(view.getByText("₹30")).toBeTruthy();
    for (const label of ["Pickup", "Code", "Return", "Payment", "Done"]) {
      expect(view.getAllByText(label).length).toBeGreaterThan(0);
    }
    await fireEvent.changeText(view.getByLabelText("Pickup code"), "5678");
    await fireEvent.press(view.getByText("Parcel returned"));

    await waitFor(() => expect(mockApi.returnParcel).toHaveBeenCalledWith("ride-1", "5678"));
  });

  it("collects the return leg at the pickup, with Payment received or Not paid", async () => {
    mockRide = parcelRide(
      "RETURNED",
      { payment_status: "COLLECTED", final_fare_paise: 8100 },
      { return_fare_paise: 3000, return_payment_status: "DUE", pickup: null, drop: null },
    );
    mockApi.markPaymentNotReceived.mockResolvedValue(parcelRide("RETURNED", { payment_status: "COLLECTED" }));
    confirmAlert("Not paid");
    const view = await renderParcel();

    expect(view.getByText("Collect at the pickup")).toBeTruthy();
    expect(view.getByText("₹30")).toBeTruthy();
    expect(view.getByText("The return trip")).toBeTruthy();
    expect(view.queryByText("Collect later")).toBeNull();
    await fireEvent.press(view.getByText("Not paid"));

    await waitFor(() => expect(mockApi.markPaymentNotReceived).toHaveBeenCalledWith("ride-1"));
  });

  it("asks for the whole job when nothing was collected before", async () => {
    mockRide = parcelRide(
      "RETURNED",
      { final_fare_paise: 8100 },
      { payer: "RECEIVER", return_fare_paise: 3000, return_payment_status: "DUE", pickup: null, drop: null },
    );
    const view = await renderParcel();

    expect(view.getByText("₹81")).toBeTruthy();
    expect(view.getByText("The parcel fare and the return trip")).toBeTruthy();
  });

  it("no longer shows anyone's name or phone once the parcel is not open", async () => {
    mockRide = parcelRide("RETURNED", {}, { return_payment_status: "DUE", return_fare_paise: 3000, pickup: null, drop: null });
    const view = await renderParcel();

    expect(view.queryByText("Ravi Kumar")).toBeNull();
    expect(view.queryByLabelText("Call Ravi")).toBeNull();
    expect(view.getByText("Gachibowli Stadium")).toBeTruthy();
  });
});

describe("the end", () => {
  it("shows a summary after the last step and goes home", async () => {
    mockRide = parcelRide("IN_TRIP", { final_fare_paise: 5300 });
    mockApi.markPaymentReceived.mockResolvedValue(parcelRide("COMPLETED", { payment_status: "COLLECTED" }));
    const view = await renderParcel();

    await fireEvent.press(view.getByText("Payment received"));
    // The server now says COMPLETED and paid: the finished job stays for a summary.
    mockRide = null;

    expect(await view.findByText("Parcel delivered")).toBeTruthy();
    await fireEvent.press(view.getByText("Back to Home"));
    expect(mockReplace).toHaveBeenCalledWith("/rides");
  });

  it("says Not paid on the summary so it is not a silent end", async () => {
    mockRide = parcelRide("RETURNED", {}, { return_payment_status: "DUE", return_fare_paise: 3000, pickup: null, drop: null });
    mockApi.markPaymentNotReceived.mockResolvedValue(
      parcelRide("RETURNED", { payment_status: "UNPAID" }, { return_payment_status: "UNPAID", return_fare_paise: 3000 }),
    );
    confirmAlert("Not paid");
    const view = await renderParcel();

    await fireEvent.press(view.getByText("Not paid"));

    expect(await view.findByText("Parcel returned")).toBeTruthy();
    expect(view.getByText("Not paid. Operations will follow it up.")).toBeTruthy();
  });

  it("explains when there is no parcel", async () => {
    mockRide = null;
    const view = await renderParcel();

    expect(view.getByText("You don't have a parcel right now.")).toBeTruthy();
  });
});
