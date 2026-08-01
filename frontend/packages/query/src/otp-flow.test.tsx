import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiNetworkError, ApiRequestError, type ApiClient } from "@vsolve/api-client";

import { createTabChannel } from "./cross-tab";
import {
  describeOtpFailure,
  sanitizeCodeInput,
  sanitizePhoneInput,
  useOtpFlow,
  type OtpFlowOptions,
} from "./otp-flow";

/**
 * The OTP flow is the only place in the product where a person is stopped and
 * asked to prove who they are, and it is entered from a half-finished booking.
 * These cover the states that decide whether they get back to it: what is
 * allowed on each step, both server-authored countdowns, and every failure
 * Django can answer with.
 *
 * Django is stubbed at the client boundary rather than mocked at the hook
 * boundary, so the real request/unwrap/error-envelope path is exercised.
 */

const PHONE = "9876543210";
const CODE = "123456";

function jsonResponse(status: number): Response {
  return new Response(null, { status, headers: { date: new Date().toUTCString() } });
}

/** A successful openapi-fetch result. */
function ok<T>(data: T) {
  return { data, response: jsonResponse(200) };
}

/** A contract-shaped Django error envelope. */
function apiError(
  status: number,
  code: string,
  details: unknown = null,
  requestId = "req_test_1",
) {
  return {
    error: {
      error: {
        code,
        // Django sets this to the HTTP status phrase, not customer-safe copy.
        message: status === 400 ? "Bad Request" : "Too Many Requests",
        details,
        retryable: status === 429,
        request_id: requestId,
      },
    },
    response: jsonResponse(status),
  };
}

const ISSUED = {
  challenge_id: "11111111-1111-1111-1111-111111111111",
  expires_in_seconds: 300,
  resend_after_seconds: 60,
  code_length: 6,
  development_code: null,
};

const SESSION = {
  active_role: "customer",
  user: {
    id: "22222222-2222-2222-2222-222222222222",
    phone_number: "+919876543210",
    full_name: "",
    email: "",
    roles: ["customer"],
  },
  session_expires_at: "2026-08-02T00:00:00Z",
};

/** A result factory, so a rejection is only created when the call is made. */
type StubResult = () => Promise<unknown>;

const resolves = (value: unknown): StubResult => () => Promise.resolve(value);
/** fetch itself failed: offline, DNS, TLS, aborted navigation. */
const transportFailure = (): StubResult => () =>
  Promise.reject(new TypeError("fetch failed"));

interface Stub {
  apiClient: ApiClient;
  /** Queued results for a path, consumed in order; the last one repeats. */
  queue: (path: string, ...results: StubResult[]) => void;
  calls: { method: string; path: string; body?: unknown }[];
}

function createStub(): Stub {
  const queued = new Map<string, StubResult[]>();
  const calls: Stub["calls"] = [];

  const take = (path: string): StubResult => {
    const results = queued.get(path);
    if (!results || results.length === 0) return resolves(ok(null));
    const next = results.length === 1 ? results[0] : results.shift();
    return next ?? resolves(ok(null));
  };

  const handler =
    (method: string) =>
    (path: string, init?: { body?: unknown }): Promise<unknown> => {
      calls.push({ method, path, body: init?.body });
      return take(path)();
    };

  const apiClient = {
    GET: handler("GET"),
    POST: handler("POST"),
    DELETE: handler("DELETE"),
  } as unknown as ApiClient;

  return {
    apiClient,
    calls,
    queue: (path, ...results) => queued.set(path, results),
  };
}

function renderFlow(stub: Stub, options: OtpFlowOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return renderHook(() => useOtpFlow(stub.apiClient, options), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

/**
 * Flushes the mutation's promise chain.
 *
 * `waitFor` is avoided deliberately: it polls on real timers, and this file runs
 * on fake ones so the countdowns are deterministic. The stubs resolve
 * immediately, so draining the microtask queue is sufficient and cannot hang.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("input sanitising", () => {
  it("keeps only what a phone number can contain, with one leading plus", () => {
    expect(sanitizePhoneInput("98765 43210")).toBe("98765 43210");
    expect(sanitizePhoneInput("+91 98765-43210")).toBe("+91 98765-43210");
    expect(sanitizePhoneInput("call me 9876543210")).toBe("9876543210");
    expect(sanitizePhoneInput("+91+98")).toBe("+9198");
  });

  it("reduces a pasted code to digits and clamps it to the expected length", () => {
    // SMS autofill and "copy message" both arrive with formatting attached.
    expect(sanitizeCodeInput("1 2 3 4 5 6", 6)).toBe("123456");
    expect(sanitizeCodeInput("Your code is 123456", 6)).toBe("123456");
    expect(sanitizeCodeInput("1234567890", 6)).toBe("123456");
  });
});

describe("phone step", () => {
  it("starts unauthenticated with no code requested", () => {
    const stub = createStub();
    const { result } = renderFlow(stub);

    expect(result.current.phase).toBe("phone");
    expect(result.current.canRequest).toBe(false);
    expect(result.current.expiresInSeconds).toBeNull();
    expect(stub.calls).toHaveLength(0);
  });

  it("will not spend one of the five allowed codes on an incomplete number", async () => {
    const stub = createStub();
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange("98765"));
    expect(result.current.canRequest).toBe(false);

    await act(async () => result.current.onRequestCode());
    expect(result.current.phoneError).toBe("Enter your 10-digit mobile number.");
    expect(stub.calls).toHaveLength(0);
  });

  it("clears the field error as soon as the number is corrected", async () => {
    const stub = createStub();
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange("98765"));
    await act(async () => result.current.onRequestCode());
    expect(result.current.phoneError).not.toBeNull();

    act(() => result.current.onPhoneChange(PHONE));
    expect(result.current.phoneError).toBeNull();
    expect(result.current.canRequest).toBe(true);
  });

  it("moves to the code step and starts both server-authored countdowns", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/request/", resolves(ok(ISSUED)));
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange(PHONE));
    await act(async () => result.current.onRequestCode());
    await settle();

    expect(result.current.phase).toBe("code");
    expect(result.current.resendInSeconds).toBe(60);
    expect(result.current.expiresInSeconds).toBe(300);
    expect(result.current.isExpired).toBe(false);
  });

  it("leaves the CSRF bootstrap to the transport", async () => {
    // The hook used to fetch a token itself before every OTP request. That was a
    // second mechanism for something `createApiClient` now does for *every*
    // unsafe request — and one each new mutation would have had to copy.
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/request/", resolves(ok(ISSUED)));
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange(PHONE));
    await act(async () => result.current.onRequestCode());
    await settle();

    expect(stub.calls.map((call) => call.path)).toEqual(["/api/v1/auth/otp/request/"]);
  });

  it("puts a Django validation message under the phone field", async () => {
    const stub = createStub();
    stub.queue(
      "/api/v1/auth/otp/request/",
      // The shape Django's exception handler actually emits.
      resolves(
        apiError(400, "validation_error", {
          phone_number: [{ message: "Enter a valid phone number.", code: "invalid" }],
        }),
      ),
    );
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange("1111111111"));
    await act(async () => result.current.onRequestCode());
    await settle();

    expect(result.current.phoneError).toBe("Enter a valid phone number.");
    expect(result.current.failure).toBeNull();
    expect(result.current.phase).toBe("phone");
  });

  it("never shows Django's raw status phrase when it is throttled", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/request/", resolves(apiError(429, "throttled")));
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange(PHONE));
    await act(async () => result.current.onRequestCode());
    await settle();

    expect(result.current.failure?.kind).toBe("rate_limited");
    expect(result.current.failure?.message).not.toContain("Too Many Requests");
    expect(result.current.failure?.reference).toBe("req_test_1");
    expect(result.current.phase).toBe("phone");
  });

  it("says nothing was submitted when the request never reached Django", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/request/", transportFailure());
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange(PHONE));
    await act(async () => result.current.onRequestCode());
    await settle();

    expect(result.current.failure?.kind).toBe("network");
    expect(result.current.failure?.message).toContain("Nothing was submitted");
  });
});

describe("resend cooldown", () => {
  async function reachCodeStep(stub: Stub) {
    stub.queue("/api/v1/auth/otp/request/", resolves(ok(ISSUED)));
    const rendered = renderFlow(stub);
    act(() => rendered.result.current.onPhoneChange(PHONE));
    await act(async () => rendered.result.current.onRequestCode());
    await settle();
    return rendered;
  }

  it("counts down and does not resend until the server's cooldown elapses", async () => {
    const stub = createStub();
    const { result } = await reachCodeStep(stub);
    const callsAfterFirst = stub.calls.length;

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.resendInSeconds).toBe(30);

    await act(async () => result.current.onResendCode());
    expect(stub.calls).toHaveLength(callsAfterFirst);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.resendInSeconds).toBe(0);

    await act(async () => result.current.onResendCode());
    await settle();
    expect(stub.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("recomputes from the deadline, so a throttled background tab catches up", async () => {
    const stub = createStub();
    const { result } = await reachCodeStep(stub);

    // One late tick standing in for a tab the browser stopped scheduling.
    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    expect(result.current.resendInSeconds).toBe(15);
  });

  it("keeps the cooldown when returning to the same number", async () => {
    const stub = createStub();
    const { result } = await reachCodeStep(stub);

    act(() => {
      vi.advanceTimersByTime(10_000);
      result.current.onChangeNumber();
    });

    expect(result.current.phase).toBe("phone");
    // Django rate-limits per phone number, so stepping back must not hand out a
    // free extra request for the same one.
    expect(result.current.resendInSeconds).toBe(50);
    expect(result.current.canRequest).toBe(false);
  });

  it("drops the cooldown once the number is edited to a different one", async () => {
    const stub = createStub();
    const { result } = await reachCodeStep(stub);

    act(() => {
      result.current.onChangeNumber();
      result.current.onPhoneChange("9000000000");
    });

    expect(result.current.resendInSeconds).toBe(0);
    expect(result.current.canRequest).toBe(true);
  });
});

describe("verify step", () => {
  async function reachCodeStep(stub: Stub, options: OtpFlowOptions = {}) {
    stub.queue("/api/v1/auth/otp/request/", resolves(ok(ISSUED)));
    const rendered = renderFlow(stub, options);
    act(() => rendered.result.current.onPhoneChange(PHONE));
    await act(async () => rendered.result.current.onRequestCode());
    await settle();
    return rendered;
  }

  it("stays disabled until the code is the expected length", async () => {
    const stub = createStub();
    const { result } = await reachCodeStep(stub);

    expect(result.current.canVerify).toBe(false);
    act(() => result.current.onCodeChange("12345"));
    expect(result.current.canVerify).toBe(false);
    act(() => result.current.onCodeChange("123456"));
    expect(result.current.canVerify).toBe(true);
  });

  it("authenticates, then keeps neither the code nor the challenge", async () => {
    const stub = createStub();
    const onAuthenticated = vi.fn();
    stub.queue("/api/v1/auth/otp/verify/", resolves(ok(SESSION)));
    const { result } = await reachCodeStep(stub, { onAuthenticated });

    act(() => result.current.onCodeChange(CODE));
    await act(async () => result.current.onVerifyCode());
    await settle();

    expect(result.current.phase).toBe("authenticated");
    expect(result.current.signedInPhone).toBe("+919876543210");
    expect(result.current.code).toBe("");
    expect(result.current.canVerify).toBe(false);
    expect(onAuthenticated).toHaveBeenCalledWith(SESSION);
  });

  it("covers wrong, expired and locked with one message, because Django will not say which", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/verify/", resolves(apiError(400, "invalid_otp")));
    const { result } = await reachCodeStep(stub);

    act(() => result.current.onCodeChange("000000"));
    await act(async () => result.current.onVerifyCode());
    await settle();

    expect(result.current.codeError).toContain("not right, or it has expired");
    expect(result.current.failure).toBeNull();
    expect(result.current.phase).toBe("code");
    // Still on the step, with the code editable, so a typo is one keystroke from
    // being fixed rather than a restart.
    expect(result.current.code).toBe("000000");
  });

  it("clears the code error as soon as the code is edited", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/verify/", resolves(apiError(400, "invalid_otp")));
    const { result } = await reachCodeStep(stub);

    act(() => result.current.onCodeChange("000000"));
    await act(async () => result.current.onVerifyCode());
    await settle();
    expect(result.current.codeError).not.toBeNull();

    act(() => result.current.onCodeChange("000001"));
    expect(result.current.codeError).toBeNull();
  });

  it("blocks verification once the code has expired and points at a new one", async () => {
    const stub = createStub();
    const { result } = await reachCodeStep(stub);

    act(() => result.current.onCodeChange(CODE));
    act(() => {
      vi.advanceTimersByTime(300_000);
    });

    expect(result.current.isExpired).toBe(true);
    expect(result.current.canVerify).toBe(false);
    expect(result.current.resendInSeconds).toBe(0);

    await act(async () => result.current.onVerifyCode());
    expect(result.current.codeError).toContain("expired");
    expect(stub.calls.some((call) => call.path === "/api/v1/auth/otp/verify/")).toBe(false);
  });

  it("surfaces a transport failure as a banner, not as a wrong-code accusation", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/verify/", transportFailure());
    const { result } = await reachCodeStep(stub);

    act(() => result.current.onCodeChange(CODE));
    await act(async () => result.current.onVerifyCode());
    await settle();

    expect(result.current.codeError).toBeNull();
    expect(result.current.failure?.kind).toBe("network");
  });

  it("exposes the development code only when Django sent one", async () => {
    const stub = createStub();
    const { result } = await reachCodeStep(stub);
    expect(result.current.developmentCode).toBeNull();

    const devStub = createStub();
    devStub.queue(
      "/api/v1/auth/otp/request/",
      resolves(ok({ ...ISSUED, development_code: "424242" })),
    );
    const dev = renderFlow(devStub);
    act(() => dev.result.current.onPhoneChange(PHONE));
    await act(async () => dev.result.current.onRequestCode());
    await settle();

    expect(dev.result.current.developmentCode).toBe("424242");
  });
});

describe("logout", () => {
  it("returns to a clean phone step so the next person starts fresh", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/request/", resolves(ok(ISSUED)));
    stub.queue("/api/v1/auth/otp/verify/", resolves(ok(SESSION)));
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange(PHONE));
    await act(async () => result.current.onRequestCode());
    await settle();
    act(() => result.current.onCodeChange(CODE));
    await act(async () => result.current.onVerifyCode());
    await settle();
    expect(result.current.phase).toBe("authenticated");

    await act(async () => result.current.onLogout());
    await settle();

    expect(result.current.phase).toBe("phone");
    expect(result.current.phone).toBe("");
    expect(result.current.signedInPhone).toBeNull();
    expect(stub.calls.some((call) => call.path === "/api/v1/auth/logout/")).toBe(true);
  });

  it("stops claiming a session when another tab logs out", async () => {
    // BroadcastChannel delivery is asynchronous and this assertion is about
    // real delivery, not a countdown, so this one test runs on real timers.
    vi.useRealTimers();

    const stub = createStub();
    stub.queue("/api/v1/auth/otp/request/", resolves(ok(ISSUED)));
    stub.queue("/api/v1/auth/otp/verify/", resolves(ok(SESSION)));
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange(PHONE));
    await act(async () => result.current.onRequestCode());
    await settle();
    act(() => result.current.onCodeChange(CODE));
    await act(async () => result.current.onVerifyCode());
    await settle();
    expect(result.current.phase).toBe("authenticated");

    const sibling = createTabChannel();
    await act(async () => {
      sibling.publish({ type: "session.logout" });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.phase).toBe("phone");
    expect(result.current.signedInPhone).toBeNull();
    sibling.close();
  });

  it("does not keep claiming a session when logout itself fails", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/request/", resolves(ok(ISSUED)));
    stub.queue("/api/v1/auth/otp/verify/", resolves(ok(SESSION)));
    stub.queue("/api/v1/auth/logout/", transportFailure());
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange(PHONE));
    await act(async () => result.current.onRequestCode());
    await settle();
    act(() => result.current.onCodeChange(CODE));
    await act(async () => result.current.onVerifyCode());
    await settle();

    await act(async () => result.current.onLogout());
    await settle();

    expect(result.current.phase).toBe("phone");
    expect(result.current.signedInPhone).toBeNull();
  });
});

describe("describeOtpFailure", () => {
  const envelope = (code: string, message: string) => ({
    code,
    message,
    details: null,
    retryable: false,
    request_id: "req_test_2",
  });

  it("separates a delivery outage from a rejected request", () => {
    expect(describeOtpFailure(new ApiRequestError(503, envelope("otp_unavailable", "Service Unavailable"))).kind)
      .toBe("delivery_unavailable");
    expect(describeOtpFailure(new ApiRequestError(400, envelope("invalid_otp", "Bad Request"))).kind)
      .toBe("unexpected");
  });

  it("keeps Django's status-phrase message out of every branch", () => {
    // The envelope's `message` is the HTTP reason phrase, so no branch may pass
    // it through to a person trying to log in.
    for (const failure of [
      describeOtpFailure(new ApiRequestError(429, envelope("throttled", "Too Many Requests"))),
      describeOtpFailure(new ApiRequestError(503, envelope("otp_unavailable", "Service Unavailable"))),
      describeOtpFailure(new ApiRequestError(400, envelope("invalid_otp", "Bad Request"))),
      describeOtpFailure(new ApiNetworkError("offline", new Error("x"))),
      describeOtpFailure(new Error("render fault")),
    ]) {
      expect(failure.title).not.toMatch(/Request|Unavailable/);
      expect(failure.message.length).toBeGreaterThan(20);
    }
  });

  it("carries the backend reference forward so support can find the request", () => {
    const failure = describeOtpFailure(
      new ApiRequestError(429, envelope("throttled", "Too Many Requests")),
    );
    expect(failure.reference).toBe("req_test_2");
    expect(failure.severity).toBe("warning");
  });
});

describe("code length", () => {
  it("follows the length Django published with the challenge", async () => {
    // Contract 1.3.0 publishes `code_length`. A deployment that changes
    // OTP_CODE_LENGTH must not leave the client truncating a pasted code or
    // refusing to enable Verify on a complete one.
    const stub = createStub();
    stub.queue("/api/v1/auth/otp/request/", resolves(ok({ ...ISSUED, code_length: 4 })));
    const { result } = renderFlow(stub);

    act(() => result.current.onPhoneChange(PHONE));
    await act(async () => result.current.onRequestCode());
    await settle();

    expect(result.current.codeLength).toBe(4);

    act(() => result.current.onCodeChange("123456"));
    expect(result.current.code).toBe("1234");
    expect(result.current.canVerify).toBe(true);
  });

  it("uses the local default only before a challenge exists", () => {
    const stub = createStub();
    const { result } = renderFlow(stub, { codeLength: 6 });
    expect(result.current.codeLength).toBe(6);
  });
});
