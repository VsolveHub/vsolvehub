import { act, fireEvent, render } from "@testing-library/react-native";

import { ChooseRideScreen } from "./ChooseRideScreen";

const mockFit = jest.fn();
const mockRefetch = jest.fn();
let mockQuotes: Record<string, unknown>;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  // A new object on every call, like the real router on a re-render.
  useLocalSearchParams: () => ({
    pickupLat: "9.480000",
    pickupLng: "76.340000",
    pickupLabel: "Alappuzha beach",
    dropLat: "9.500000",
    dropLng: "76.340000",
    dropLabel: "Boat jetty",
  }),
}));
jest.mock("react-native-maps", () => {
  const { Component } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  class MockMap extends Component<{ children?: unknown; onMapReady?: () => void }> {
    componentDidMount() {
      this.props.onMapReady?.();
    }
    fitToCoordinates(...args: unknown[]) {
      mockFit(...args);
    }
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
  useFareQuotes: () => mockQuotes,
}));

// Two points, as the server sends them: an encoded polyline.
const ROUTE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

/** One answer from the server: a bike and an auto quote. `expiresAt` is on the SERVER's clock. */
function quotes(routePolyline: string, idPrefix = "q", expiresAt = Date.now() + 5 * 60 * 1000) {
  const quote = (type: string, fare: number) => ({
    id: `${idPrefix}-${type}`,
    vehicle_type: type,
    fare_paise: fare,
    distance_m: 2200,
    duration_s: 600,
    route_polyline: routePolyline,
    expires_at: new Date(expiresAt).toISOString(),
  });
  return {
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
    dataUpdatedAt: Date.now(),
    data: { quotes: [quote("BIKE", 4300), quote("AUTO", 6800)] },
  };
}

beforeEach(() => {
  mockFit.mockClear();
  mockRefetch.mockClear();
  mockQuotes = quotes("");
});

describe("the map", () => {
  it("frames the trip once, then the route once it arrives, and never on a re-render", async () => {
    const view = await render(<ChooseRideScreen />);
    expect(mockFit).toHaveBeenCalledTimes(1); // pickup and drop, as soon as the map is ready

    await view.rerender(<ChooseRideScreen />);
    await view.rerender(<ChooseRideScreen />);
    expect(mockFit).toHaveBeenCalledTimes(1); // the rider's own zoom is left alone

    mockQuotes = quotes(ROUTE);
    await view.rerender(<ChooseRideScreen />);
    expect(mockFit).toHaveBeenCalledTimes(2); // the road route arrived

    await view.rerender(<ChooseRideScreen />);
    expect(mockFit).toHaveBeenCalledTimes(2);
  });

  it("leaves a small, even margin around the trip, not room for a sheet over the map", async () => {
    await render(<ChooseRideScreen />);
    const options = mockFit.mock.calls[0]?.[1] as { edgePadding: Record<string, number> };
    expect(options.edgePadding).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
  });
});

describe("asking for prices again", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("counts from when the prices arrived, so a phone clock hours off does not cause a loop", async () => {
    // The server's expires_at is hours in the past by this phone's clock.
    mockQuotes = quotes("", "q", Date.now() - 6 * 60 * 60 * 1000);
    await render(<ChooseRideScreen />);

    await act(async () => {
      jest.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(mockRefetch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(40 * 1000); // 4.5 minutes after they arrived
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

describe("the chosen vehicle", () => {
  it("stays chosen when fresh prices arrive with new quote ids", async () => {
    const view = await render(<ChooseRideScreen />);
    await fireEvent.press(view.getByText("Auto"));
    expect(view.getByText(/^Book Auto/)).toBeTruthy();

    mockQuotes = quotes("", "fresh"); // the same vehicles, new quote ids
    await view.rerender(<ChooseRideScreen />);

    expect(view.getByText(/^Book Auto/)).toBeTruthy();
  });
});

describe("when the server says too many price checks", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockQuotes = {
      isPending: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
      errorUpdatedAt: 1,
      error: { api: true, status: 429, code: "throttled", details: { retry_after_seconds: 45 } },
    };
  });
  afterEach(() => jest.useRealTimers());

  it("holds Try again until the wait is over, then allows it", async () => {
    const view = await render(<ChooseRideScreen />);
    expect(view.getByText("Too many price checks in a short time. You can try again in 45 s.")).toBeTruthy();

    await fireEvent.press(view.getByText("Try again"));
    expect(mockRefetch).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(46_000);
    });
    expect(view.getByText("You can try again now.")).toBeTruthy();
    await fireEvent.press(view.getByText("Try again"));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

describe("any other price error", () => {
  it("cannot be tapped again while a call is already going", async () => {
    mockQuotes = {
      isPending: false,
      isError: true,
      isFetching: true,
      refetch: mockRefetch,
      errorUpdatedAt: 2,
      error: { api: true, status: 503, code: "routing_unavailable", details: null },
    };
    const view = await render(<ChooseRideScreen />);

    await fireEvent.press(view.getByText("Try again"));

    expect(mockRefetch).not.toHaveBeenCalled();
  });
});
