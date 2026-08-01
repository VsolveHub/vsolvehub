import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calibrateFromPayload, createApiClient, request } from "./client";
import { resetCsrfStateForTests } from "./csrf";
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
  // The token store is process-wide, like the tab it models.
  resetCsrfStateForTests();
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

  it("accepts successful no-content commands", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response(null, { status: 204, headers: { date: SERVER_DATE } }),
    );
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    await expect(request(() => api.POST("/api/v1/auth/logout/"))).resolves.toBeUndefined();
  });

  it("returns the typed CSRF token published in contract 1.3.0", async () => {
    // Superseded the empty "the cookie is the payload" response: sibling
    // frontend origins cannot read an HttpOnly API-origin cookie, so the token
    // has to come back in the body.
    const { fetchImpl } = stubFetch(() => jsonResponse({ csrf_token: "tok-1" }));
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    await expect(request(() => api.GET("/api/v1/auth/csrf/"))).resolves.toEqual({
      csrf_token: "tok-1",
    });
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
            code: "address_archived",
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
    expect(apiError.code).toBe("address_archived");
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
        { error: { code: "session_expired", message: "Log in.", details: null, request_id: null } },
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
        { error: { code: "session_expired", message: "Log in.", details: null, request_id: null } },
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
    expect((error as ApiRequestError).code).toBe("session_expired");
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


/**
 * CSRF transport (proposal 0006, contract 1.3.0).
 *
 * These are the assertions that would have caught the previous implementation:
 * it read `document.cookie`, which is empty for an HttpOnly cookie set on
 * another origin, so every authenticated mutation would have failed the first
 * time it ran outside localhost while every unit and MSW test kept passing.
 */
describe("CSRF transport", () => {
  function csrfAwareStub(options: { tokens: string[]; rejectFirstMutation?: boolean }) {
    const tokens = [...options.tokens];
    let issued = 0;
    let mutations = 0;
    const sentTokens: (string | null)[] = [];
    const paths: string[] = [];

    const fetchImpl = async (input: Request): Promise<Response> => {
      const path = new URL(input.url).pathname;
      paths.push(path);

      if (path === "/api/v1/auth/csrf/") {
        const token = tokens[Math.min(issued, tokens.length - 1)] ?? "tok";
        issued += 1;
        return jsonResponse({ csrf_token: token });
      }

      sentTokens.push(input.headers.get("X-CSRFToken"));
      mutations += 1;

      if (options.rejectFirstMutation && mutations === 1) {
        return jsonResponse(
          {
            error: {
              code: "csrf_failed",
              message: "CSRF verification failed.",
              details: null,
              retryable: false,
              request_id: "req_csrf",
            },
          },
          { status: 403 },
        );
      }

      return new Response(null, { status: 204, headers: { date: SERVER_DATE } });
    };

    return { fetchImpl, sentTokens, paths, issuedCount: () => issued };
  }

  it("bootstraps a token before the first unsafe request and sends it", async () => {
    const stub = csrfAwareStub({ tokens: ["tok-1"] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: stub.fetchImpl });

    await request(() => api.POST("/api/v1/auth/logout/"));

    expect(stub.paths).toEqual(["/api/v1/auth/csrf/", "/api/v1/auth/logout/"]);
    expect(stub.sentTokens).toEqual(["tok-1"]);
  });

  it("does not bootstrap for a safe request", async () => {
    // A catalog read needs no token, and fetching one would make every public
    // page pay for a round trip it never uses.
    const stub = csrfAwareStub({ tokens: ["tok-1"] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: stub.fetchImpl });

    await request(() => api.GET("/api/v1/categories/")).catch(() => undefined);

    expect(stub.paths).toEqual(["/api/v1/categories/"]);
  });

  it("reuses one token across mutations instead of re-fetching", async () => {
    const stub = csrfAwareStub({ tokens: ["tok-1"] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: stub.fetchImpl });

    await request(() => api.POST("/api/v1/auth/logout/"));
    await request(() => api.POST("/api/v1/auth/logout/"));

    expect(stub.issuedCount()).toBe(1);
    expect(stub.sentTokens).toEqual(["tok-1", "tok-1"]);
  });

  it("bootstraps once when concurrent mutations start together", async () => {
    // A form submit racing a background mutation must not start a stampede.
    const stub = csrfAwareStub({ tokens: ["tok-1"] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: stub.fetchImpl });

    await Promise.all([
      request(() => api.POST("/api/v1/auth/logout/")),
      request(() => api.POST("/api/v1/auth/logout/")),
    ]);

    expect(stub.issuedCount()).toBe(1);
  });

  it("re-fetches and retries once when Django reports a rotated token", async () => {
    // Django rotates on login, logout and role switch. Without the retry the
    // first mutation after any of those fails with a 403 nobody can act on.
    const stub = csrfAwareStub({ tokens: ["stale", "fresh"], rejectFirstMutation: true });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: stub.fetchImpl });

    await expect(request(() => api.POST("/api/v1/auth/logout/"))).resolves.toBeUndefined();
    expect(stub.sentTokens).toEqual(["stale", "fresh"]);
  });

  it("surfaces a second rejection rather than retrying forever", async () => {
    const stub = csrfAwareStub({ tokens: ["same", "same"], rejectFirstMutation: true });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: stub.fetchImpl });

    // The re-bootstrap returned the same value, so there is nothing new to send
    // and the original rejection is the honest answer.
    await expect(request(() => api.POST("/api/v1/auth/logout/"))).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(stub.sentTokens).toEqual(["same"]);
  });

  it("does not retry a non-CSRF 403", async () => {
    // A permission denial is not a transport problem, and replaying the command
    // would be a second attempt at something the server already refused.
    let calls = 0;
    const fetchImpl = async (input: Request): Promise<Response> => {
      if (new URL(input.url).pathname === "/api/v1/auth/csrf/") {
        return jsonResponse({ csrf_token: "tok" });
      }
      calls += 1;
      return jsonResponse(
        {
          error: {
            code: "permission_denied",
            message: "You cannot do that.",
            details: null,
            retryable: false,
            request_id: null,
          },
        },
        { status: 403 },
      );
    };
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    await expect(request(() => api.POST("/api/v1/auth/logout/"))).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(calls).toBe(1);
  });

  it("never writes the token to browser storage", async () => {
    // Proposal 0006: a token readable by any script on the origin outlives the
    // tab and survives logout, which is the class of bug HttpOnly exists for.
    const stub = csrfAwareStub({ tokens: ["tok-1"] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: stub.fetchImpl });

    await request(() => api.POST("/api/v1/auth/logout/"));

    const storage = globalThis as { localStorage?: Storage; sessionStorage?: Storage };
    const stored = [
      ...Object.values(storage.localStorage ?? {}),
      ...Object.values(storage.sessionStorage ?? {}),
    ].join(" ");
    expect(stored).not.toContain("tok-1");
  });

  it("drops the token when the session ends, so the next login bootstraps a new one", async () => {
    let issued = 0;
    const fetchImpl = async (input: Request): Promise<Response> => {
      const path = new URL(input.url).pathname;
      if (path === "/api/v1/auth/csrf/") {
        issued += 1;
        return jsonResponse({ csrf_token: `tok-${issued}` });
      }
      return jsonResponse(
        {
          error: {
            code: "not_authenticated",
            message: "Log in.",
            details: null,
            retryable: false,
            request_id: null,
          },
        },
        { status: 401 },
      );
    };
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchImpl });

    await request(() => api.POST("/api/v1/auth/logout/")).catch(() => undefined);
    await request(() => api.POST("/api/v1/auth/logout/")).catch(() => undefined);

    expect(issued).toBe(2);
  });
});

describe("session-loss recovery", () => {
  function unauthenticated(status: number, code: string): Response {
    return jsonResponse(
      {
        error: {
          code,
          message: "Authentication credentials were not provided.",
          details: null,
          retryable: false,
          request_id: null,
        },
      },
      { status },
    );
  }

  it("fires the recovery hook on DRF's 403 for a missing session", async () => {
    // The gap a real-browser test found: watching only for 401 meant a session
    // that ended mid-flow never told sibling tabs, because DRF answers 403.
    let recovered = 0;
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: async () => unauthenticated(403, "not_authenticated"),
      onUnauthorized: () => {
        recovered += 1;
      },
    });

    await request(() => api.GET("/api/v1/partner/application/")).catch(() => undefined);
    await vi.waitFor(() => expect(recovered).toBe(1));
  });

  it("still fires on a plain 401", async () => {
    let recovered = 0;
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: async () => unauthenticated(401, "not_authenticated"),
      onUnauthorized: () => {
        recovered += 1;
      },
    });

    await request(() => api.GET("/api/v1/partner/application/")).catch(() => undefined);
    await vi.waitFor(() => expect(recovered).toBe(1));
  });

  it("does not fire on a genuine permission denial", async () => {
    // A reviewer refused one action still has a session. Clearing it would log
    // them out of work they are allowed to do.
    let recovered = 0;
    const api = createApiClient({
      baseUrl: BASE_URL,
      fetch: async () => unauthenticated(403, "permission_denied"),
      onUnauthorized: () => {
        recovered += 1;
      },
    });

    await request(() => api.GET("/api/v1/partner/application/")).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(recovered).toBe(0);
  });
});
