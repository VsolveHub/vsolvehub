import { START_FAILED_MESSAGE, goOffDuty, goOnDuty, reconcileDuty } from "./duty";

const mockRequest = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockHasStarted = jest.fn();
const mockStore: Record<string, string> = {};

jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  startLocationUpdatesAsync: (...args: unknown[]) => mockStart(...args),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStop(...args),
  hasStartedLocationUpdatesAsync: (...args: unknown[]) => mockHasStarted(...args),
}));
jest.mock("@vsolve/api-client", () => ({
  request: (call: () => unknown) => mockRequest(call),
  isApiRequestError: () => false,
}));
jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => ({ POST: (path: string) => path, GET: (path: string) => path }),
  useAuthStore: { getState: () => ({ token: "t", hydrate: async () => undefined }) },
  kvGet: async (key: string) => mockStore[key] ?? null,
  kvSet: async (key: string, value: string) => {
    mockStore[key] = value;
  },
}));

const order: string[] = [];

function paths(): string[] {
  return mockRequest.mock.calls.map(([call]) => (call as () => string)());
}

beforeEach(() => {
  order.length = 0;
  mockRequest.mockReset().mockImplementation(async (call: () => string) => {
    order.push(call());
    return { on_duty: true, started_at: "x", server_now: new Date().toISOString() };
  });
  mockStart.mockReset().mockImplementation(async () => {
    order.push("start-gps");
  });
  mockStop.mockReset().mockImplementation(async () => {
    order.push("stop-gps");
  });
  mockHasStarted.mockReset().mockResolvedValue(false);
});

describe("going on duty", () => {
  it("asks the server first, saves the clock, then starts GPS with the brief's options", async () => {
    await goOnDuty();

    expect(order).toEqual(["/api/v1/partner/rides/duty/start/", "start-gps"]);
    expect(mockStore["rides.clockOffsetMs"]).toBeDefined();
    expect(mockStart).toHaveBeenCalledWith(
      "rides-location",
      expect.objectContaining({ timeInterval: 5000, distanceInterval: 0 }),
    );
  });

  it("goes off duty again at once if GPS cannot start, so the server is never on duty silently", async () => {
    mockStart.mockRejectedValue(new Error("ForegroundServiceStartNotAllowedException"));

    await expect(goOnDuty()).rejects.toThrow(START_FAILED_MESSAGE);
    expect(paths()).toEqual(["/api/v1/partner/rides/duty/start/", "/api/v1/partner/rides/duty/stop/"]);
  });

  it("does not start GPS when the server refuses (no pass, not approved)", async () => {
    mockRequest.mockRejectedValue(new Error("pass_required"));

    await expect(goOnDuty()).rejects.toThrow("pass_required");
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe("going off duty", () => {
  it("stops GPS first, then tells the server", async () => {
    mockHasStarted.mockResolvedValue(true);

    await goOffDuty();

    expect(order).toEqual(["stop-gps", "/api/v1/partner/rides/duty/stop/"]);
  });
});

describe("matching the phone to the server on open", () => {
  it("restarts GPS when the server says on duty but the phone is silent", async () => {
    expect(await reconcileDuty(true)).toBe("restarted");
    expect(mockStart).toHaveBeenCalled();
  });

  it("takes the server off duty when GPS cannot restart", async () => {
    mockStart.mockRejectedValue(new Error("denied"));

    expect(await reconcileDuty(true)).toBe("stopped");
    expect(paths()).toEqual(["/api/v1/partner/rides/duty/stop/"]);
  });

  it("stops GPS when the server ended duty", async () => {
    mockHasStarted.mockResolvedValue(true);

    expect(await reconcileDuty(false)).toBe("stopped");
    expect(mockStop).toHaveBeenCalledWith("rides-location");
  });

  it("changes nothing when they already agree", async () => {
    expect(await reconcileDuty(false)).toBe("in_sync");
    mockHasStarted.mockResolvedValue(true);
    expect(await reconcileDuty(true)).toBe("in_sync");
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });
});
