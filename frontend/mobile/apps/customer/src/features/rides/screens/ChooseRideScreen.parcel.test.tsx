import { fireEvent, render } from "@testing-library/react-native";

import { ChooseRideScreen } from "./ChooseRideScreen";

const mockPush = jest.fn();
const mockUseFareQuotes = jest.fn();
let mockQuotes: Record<string, unknown>;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({
    pickupLat: "17.440000",
    pickupLng: "78.350000",
    pickupLabel: "Gachibowli Stadium",
    dropLat: "17.450000",
    dropLng: "78.380000",
    dropLabel: "Hitec City",
  }),
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
jest.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
  useQueryClient: () => ({ removeQueries: jest.fn() }),
}));
jest.mock("@vsolve/api-client", () => ({
  isApiRequestError: (error: unknown) => (error as { api?: boolean } | null)?.api === true,
}));
jest.mock("@vsolve/mobile-core", () => ({
  useAuthStore: (select: (state: { status: string }) => unknown) => select({ status: "signedIn" }),
}));
jest.mock("@/features/session/customer-login-sheet", () => ({ CustomerLoginSheet: () => null }));
jest.mock("../queries", () => ({
  bookRide: jest.fn(),
  findOpenRide: jest.fn(),
  useFareQuotes: (...args: unknown[]) => {
    mockUseFareQuotes(...args);
    return mockQuotes;
  },
}));

function quotes(kind: "RIDE" | "PARCEL") {
  const quote = (type: string, fare: number, weight: number | null, size: string) => ({
    id: `q-${type}`,
    kind,
    vehicle_type: type,
    fare_paise: fare,
    max_weight_grams: weight,
    size_label: size,
    distance_m: 4200,
    duration_s: 900,
    route_polyline: "",
    expires_at: "2026-11-23T10:05:00Z",
  });
  return {
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    dataUpdatedAt: Date.now(),
    data: {
      quotes:
        kind === "PARCEL"
          ? [quote("BIKE", 5100, 10_000, "40 x 30 x 20 cm"), quote("AUTO", 8100, 50_000, "1.3 x 3.5 x 3.3 ft")]
          : [quote("BIKE", 4300, null, ""), quote("AUTO", 6800, null, "")],
    },
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockUseFareQuotes.mockClear();
});

describe("Choose vehicle for a parcel (§5.2, item 3)", () => {
  beforeEach(() => {
    mockQuotes = quotes("PARCEL");
  });

  it("asks the server for parcel prices", async () => {
    await render(<ChooseRideScreen kind="PARCEL" />);

    expect(mockUseFareQuotes.mock.calls[0]?.[2]).toBe("PARCEL");
  });

  it("shows Bike and Auto, each with its fare and its limits", async () => {
    const view = await render(<ChooseRideScreen kind="PARCEL" />);

    expect(view.getByText("Bike")).toBeTruthy();
    expect(view.getByText("Auto")).toBeTruthy();
    expect(view.getByText("₹51")).toBeTruthy();
    expect(view.getByText("₹81")).toBeTruthy();
    expect(view.getByText("Up to 10 kg · 40 x 30 x 20 cm")).toBeTruthy();
    expect(view.getByText("Up to 50 kg · 1.3 x 3.5 x 3.3 ft")).toBeTruthy();
    expect(view.queryByText("Cab")).toBeNull();
  });

  it("opens Review with the vehicle that was tapped, and has no Book button", async () => {
    const view = await render(<ChooseRideScreen kind="PARCEL" />);

    expect(view.queryByText(/^Book /)).toBeNull();
    await fireEvent.press(view.getByText("Auto"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/rides/parcel/review",
      params: expect.objectContaining({ vehicle: "AUTO", dropLabel: "Hitec City", pickupLabel: "Gachibowli Stadium" }),
    });
  });
});

describe("Choose ride is unchanged", () => {
  beforeEach(() => {
    mockQuotes = quotes("RIDE");
  });

  it("asks for ride prices, shows no limits, and books from this screen", async () => {
    const view = await render(<ChooseRideScreen />);

    expect(mockUseFareQuotes.mock.calls[0]?.[2]).toBe("RIDE");
    expect(view.queryByText(/Up to/)).toBeNull();
    await fireEvent.press(view.getByText("Auto"));
    expect(mockPush).not.toHaveBeenCalled(); // selecting only selects
    expect(view.getByText("Book Auto · ₹68")).toBeTruthy();
  });
});

describe("where Pick up & Drop does not run", () => {
  it("says so in its own name", async () => {
    mockQuotes = {
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: jest.fn(),
      error: { api: true, code: "area_not_served", message: "x", status: 422 },
      errorUpdatedAt: 1,
      data: undefined,
    };

    const parcel = await render(<ChooseRideScreen kind="PARCEL" />);
    expect(parcel.getByText("Pick up & Drop isn't available here yet.")).toBeTruthy();

    const ride = await render(<ChooseRideScreen />);
    expect(ride.getByText("Rides isn't available here yet.")).toBeTruthy();
  });
});
