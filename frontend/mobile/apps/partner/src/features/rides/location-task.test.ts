import type { LocationObject } from "expo-location";
import { resetClockForTests } from "./model/clock";
import { LOCATION_OPTIONS, resetLocationTaskForTests, sendNewestPing } from "./location-task";

const mockRequest = jest.fn();
const mockStop = jest.fn();
const mockHasStarted = jest.fn();
const mockHydrate = jest.fn();
let mockToken: string | null = "token";
const mockStore: Record<string, string> = {};

class MockApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  hasStartedLocationUpdatesAsync: (...args: unknown[]) => mockHasStarted(...args),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStop(...args),
}));
jest.mock("@vsolve/api-client", () => ({
  request: (call: () => unknown) => mockRequest(call),
  isApiRequestError: (error: unknown) => error instanceof MockApiError,
}));
jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => ({
    POST: (path: string, init: unknown) => ({ method: "POST", path, init }),
    GET: (path: string) => ({ method: "GET", path }),
  }),
  useAuthStore: {
    getState: () => ({
      token: mockToken,
      hydrate: async () => {
        mockHydrate();
      },
    }),
  },
  kvGet: async (key: string) => mockStore[key] ?? null,
  kvSet: async (key: string, value: string) => {
    mockStore[key] = value;
  },
}));

function reading(timestamp: number, overrides: Partial<LocationObject["coords"]> = {}): LocationObject {
  return {
    timestamp,
    coords: {
      latitude: 17.44,
      longitude: 78.35,
      altitude: null,
      accuracy: 8,
      altitudeAccuracy: null,
      heading: 90,
      speed: null,
      ...overrides,
    },
  };
}

/** What the task asked the API client to do, in order. */
function calls(): { method: string; path: string; init?: { body?: Record<string, unknown> } }[] {
  return mockRequest.mock.calls.map(([call]) => (call as () => never)());
}

beforeEach(() => {
  mockRequest.mockReset();
  mockStop.mockReset();
  mockHasStarted.mockReset().mockResolvedValue(true);
  mockHydrate.mockReset();
  mockToken = "token";
  for (const key of Object.keys(mockStore)) delete mockStore[key];
  resetClockForTests();
  resetLocationTaskForTests();
});

describe("the options", () => {
  it("are the brief's: every 5 s, even parked, never killed with the app, no background permission", () => {
    expect(LOCATION_OPTIONS).toMatchObject({
      timeInterval: 5000,
      distanceInterval: 0,
      deferredUpdatesInterval: 0,
      foregroundService: { notificationTitle: "You're on duty", killServiceOnDestroy: false },
    });
  });
});

describe("sending a ping", () => {
  it("sends only the newest reading, in server time", async () => {
    mockStore["rides.clockOffsetMs"] = "120000"; // the phone runs 2 minutes slow
    mockRequest.mockResolvedValue(undefined);

    const outcome = await sendNewestPing([reading(1_000_000), reading(1_005_000), reading(1_002_000)]);

    expect(outcome).toBe("sent");
    const [ping] = calls();
    expect(ping.path).toBe("/api/v1/partner/rides/location/");
    expect(ping.init?.body).toEqual({
      latitude: 17.44,
      longitude: 78.35,
      accuracy_m: 8,
      heading: 90,
      captured_at: new Date(1_005_000 + 120_000).toISOString(),
    });
  });

  it("loads the token first, and stops instead of pinging without one", async () => {
    mockToken = null;

    const outcome = await sendNewestPing([reading(1)]);

    expect(mockHydrate).toHaveBeenCalled();
    expect(outcome).toBe("stopped");
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalledWith("rides-location");
  });

  it("drops a reading with no accuracy and sends no invalid heading", async () => {
    expect(await sendNewestPing([reading(1, { accuracy: null })])).toBe("dropped");
    mockRequest.mockResolvedValue(undefined);
    await sendNewestPing([reading(2, { heading: -1 })]);
    expect(calls()[0].init?.body?.heading).toBeNull();
  });

  it.each([
    [409, "not_on_duty"],
    [403, "not_authenticated"],
    [403, "session_expired"],
    [401, "unauthorized"],
  ])("stops the task when the server answers %s %s", async (status, code) => {
    mockRequest.mockRejectedValue(new MockApiError(status, code));

    expect(await sendNewestPing([reading(1)])).toBe("stopped");
    expect(mockStop).toHaveBeenCalledWith("rides-location");
  });

  it("keeps going when Redis is down or there is no signal", async () => {
    mockRequest.mockRejectedValueOnce(new MockApiError(503, "location_unavailable"));
    expect(await sendNewestPing([reading(1)])).toBe("dropped");
    mockRequest.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await sendNewestPing([reading(2)])).toBe("dropped");
    expect(mockStop).not.toHaveBeenCalled();
  });

  it("refreshes the clock on a stale answer, at most once a minute", async () => {
    mockRequest.mockImplementation(async (call: () => { method: string }) => {
      if (call().method === "POST") throw new MockApiError(422, "location_stale");
      return { server_now: new Date(Date.now() + 60_000).toISOString() };
    });

    expect(await sendNewestPing([reading(1)])).toBe("clock_refreshed");
    await sendNewestPing([reading(2)]);

    expect(calls().filter((call) => call.method === "GET")).toHaveLength(1);
    expect(Number(mockStore["rides.clockOffsetMs"])).toBeGreaterThan(55_000);
  });
});
