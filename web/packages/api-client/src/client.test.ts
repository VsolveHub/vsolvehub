import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calibrateFromPayload, createApiClient, request } from "./client";
import { ApiContractError, ApiNetworkError, ApiRequestError } from "./errors";
import { serverClock } from "./server-clock";

const BASE_URL = "http://api.test";
const SERVER_DATE = "Thu, 30 Jul 2026 09:00:00 GMT";

interface StubCall {
  url: string;
  method: string;
  headers: Headers;
}

/** Records requests and returns scripted responses, so no network is involved. */
function stubFetch(responder: (call: StubCall) => Response | Promise<Response>) {
  const calls: StubCall[] = [];
  const fetchImpl = async (input: Request): Promise<Response> => {
    const call = { url: input.url, method: input.method, headers: input.headers };
    calls.push(call);
    return responder(call);
  };
  return { fetchImpl, calls };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", date: SERVER_DATE, ...(init.headers ?? {}) },
  });
}

beforeEach(() => {
  serverClock.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("successful requests", () => {
  it("returns typed data through request()", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse([{ slug: "technician" }]));
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    const data = await request(() => api.GET("/api/v1/categories/"));
    expect(data).toEqual([{ slug: "technician" }]);
  });

  it("sends session credentials so the HTTP-only cookie is included", async () => {
    // Without `credentials: "include"` the browser drops the Django session
    // cookie on a cross-origin API call and every request looks logged out.
    let observedCredentials: RequestCredentials | undefined;
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: async (input) => {
        observedCredentials = input.credentials;
        return jsonResponse([]);
      },
    });

    await request(() => api.GET("/api/v1/categories/"));
    expect(observedCredentials).toBe("include");
  });
});

describe("CSRF handling", () => {
  it("attaches the CSRF header to unsafe methods", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({}, { status: 201 }));
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: fetchImpl,
      getCsrfToken: () => "token-123",
    });

    await request(() =>
      api.POST("/api/v1/addresses/", {
        body: {
          label: "Home",
          line1: "Flat 402",
          locality: "Kukatpally",
          city: "Hyderabad",
          state: "Telangana",
          postal_code: "500072",
          // The contract requires coordinates: an address is only usable for
          // matching once it has been geocoded and confirmed.
          latitude: "17.494700",
          longitude: "78.399500",
        },
      }),
    );

    expect(calls[0]?.headers.get("X-CSRFToken")).toBe("token-123");
  });

  it("does not attach it to reads", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse([]));
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: fetchImpl,
      getCsrfToken: () => "token-123",
    });

    await request(() => api.GET("/api/v1/categories/"));
    expect(calls[0]?.headers.get("X-CSRFToken")).toBeNull();
  });
});

describe("error mapping", () => {
  it("throws ApiRequestError for a contract-shaped error", async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse(
        {
          error: {
            code: "SLOT_NO_LONGER_AVAILABLE",
            message: "That time is no longer available.",
            details: null,
            request_id: "req_9",
          },
        },
        { status: 409 },
      ),
    );
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    const error = await request(() => api.GET("/api/v1/categories/")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    const apiError = error as ApiRequestError;
    expect(apiError.code).toBe("SLOT_NO_LONGER_AVAILABLE");
    expect(apiError.status).toBe(409);
    expect(apiError.requestId).toBe("req_9");
    expect(apiError.recovery).toBe("choose_again");
  });

  it("throws ApiContractError for an HTML proxy error page", async () => {
    // A 502 from nginx must not crash JSON parsing or be reported as a domain
    // error the customer caused.
    const { fetchImpl } = stubFetch(
      () =>
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          headers: { "content-type": "text/html", date: SERVER_DATE },
        }),
    );
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    const error = await request(() => api.GET("/api/v1/categories/")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiContractError);
    expect((error as ApiContractError).isTransportRetryable).toBe(true);
  });

  it("throws ApiNetworkError when fetch itself fails", async () => {
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });

    const error = await request(() => api.GET("/api/v1/categories/")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiNetworkError);
    expect((error as ApiNetworkError).isTransportRetryable).toBe(true);
  });

  it("rethrows an abort without disguising it as a network failure", async () => {
    // A cancelled navigation is not an error to show the user.
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: () => Promise.reject(new DOMException("aborted", "AbortError")),
    });

    const error = await request(() => api.GET("/api/v1/categories/")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect(error).not.toBeInstanceOf(ApiNetworkError);
  });
});

describe("session recovery", () => {
  it("invokes onUnauthorized exactly once for a 401", async () => {
    const onUnauthorized = vi.fn();
    const { fetchImpl } = stubFetch(() =>
      jsonResponse(
        { error: { code: "SESSION_EXPIRED", message: "Log in.", details: null, request_id: null } },
        { status: 401 },
      ),
    );
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl, onUnauthorized });

    await request(() => api.GET("/api/v1/addresses/")).catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not let a throwing recovery hook mask the API error", async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse(
        { error: { code: "SESSION_EXPIRED", message: "Log in.", details: null, request_id: null } },
        { status: 401 },
      ),
    );
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: fetchImpl,
      onUnauthorized: () => {
        throw new Error("router not ready");
      },
    });

    const error = await request(() => api.GET("/api/v1/addresses/")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe("SESSION_EXPIRED");
  });
});

describe("server-clock calibration", () => {
  it("calibrates from the Date response header on every request", async () => {
    vi.useFakeTimers();
    // Device clock is four minutes ahead of the server.
    vi.setSystemTime(Date.parse(SERVER_DATE) + 240_000);

    const { fetchImpl } = stubFetch(() => jsonResponse([]));
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    expect(serverClock.isCalibrated).toBe(false);
    await request(() => api.GET("/api/v1/categories/"));

    expect(serverClock.isCalibrated).toBe(true);
    // Fake timers make the round trip 0ms, so the offset is the full skew.
    expect(serverClock.offsetMs).toBe(-240_000);
  });

  it("upgrades precision from a server_now payload", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(SERVER_DATE) + 240_000);

    const serverNowIso = new Date(Date.parse(SERVER_DATE) + 750).toISOString();
    const { fetchImpl } = stubFetch(() =>
      jsonResponse({ is_serviceable: true, server_now: serverNowIso }),
    );
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    const result = await api.POST("/api/v1/serviceability/check/", {
      body: { postal_code: "500072" },
    });
    expect(result.data).toBeDefined();
    calibrateFromPayload(result.data, result.response);

    // The header sample rounded to the second; server_now recovers the 750ms.
    expect(serverClock.offsetMs).toBe(-240_000 + 750);
  });

  it("ignores calibration for a response it never timed", async () => {
    const orphan = jsonResponse({ server_now: new Date().toISOString() });
    calibrateFromPayload({ server_now: new Date().toISOString() }, orphan);
    expect(serverClock.isCalibrated).toBe(false);
  });
});
