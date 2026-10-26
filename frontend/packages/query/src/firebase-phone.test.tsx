import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@vsolve/api-client";
import { RecaptchaVerifier } from "firebase/auth";

import {
  formatToE164,
  mapFirebaseError,
  startFirebasePhoneVerification,
  useFirebasePhoneFlow,
} from "./firebase-phone";
import type { OtpFlowOptions } from "./otp-flow";
import { queryKeys } from "./keys";

const mockSignOut = vi.fn().mockResolvedValue(undefined);
const mockSignInWithPhoneNumber = vi.fn();
const mockRecaptchaClear = vi.fn();
let recaptchaInstanceCount = 0;
/** The element each RecaptchaVerifier was given, in creation order. */
let recaptchaHosts: HTMLElement[] = [];

/**
 * Sends the way real reCAPTCHA does: an element can host one widget for the
 * life of the page. Emptying it or clearing its verifier does not free it.
 */
function sendLikeRecaptcha(firstSend: () => Promise<unknown>) {
  const rendered = new WeakSet<HTMLElement>();
  let sends = 0;
  mockSignInWithPhoneNumber.mockImplementation(
    async (_auth: unknown, _phone: string, verifier: { host: HTMLElement }) => {
      if (rendered.has(verifier.host)) {
        throw new Error("reCAPTCHA has already been rendered in this element");
      }
      rendered.add(verifier.host);
      sends += 1;
      return sends === 1 ? firstSend() : { confirm: vi.fn() };
    },
  );
}

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({})),
}));

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaV3Provider: vi.fn(),
}));

vi.mock("firebase/auth", () => {
  class MockRecaptchaVerifier {
    host: HTMLElement;
    constructor(_auth: unknown, host: HTMLElement) {
      recaptchaInstanceCount += 1;
      recaptchaHosts.push(host);
      this.host = host;
    }
    clear = mockRecaptchaClear;
    render = vi.fn().mockResolvedValue(1);
    verify = vi.fn().mockResolvedValue("mock-captcha-token");
  }

  return {
    getAuth: vi.fn(() => ({
      languageCode: "en",
    })),
    signInWithPhoneNumber: (...args: unknown[]) => mockSignInWithPhoneNumber(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    RecaptchaVerifier: MockRecaptchaVerifier,
  };
});

function jsonResponse(status: number): Response {
  return new Response(null, { status, headers: { date: new Date().toUTCString() } });
}

function ok<T>(data: T, status = 200) {
  return { data, response: jsonResponse(status) };
}

function apiError(status: number, code: string, details: unknown = null, requestId = "req_test_1") {
  return {
    error: {
      error: {
        code,
        message: status === 400 ? "Bad Request" : "Error",
        details,
        retryable: status === 429,
        request_id: requestId,
      },
    },
    response: jsonResponse(status),
  };
}

const SESSION = {
  active_role: "customer",
  user: {
    id: "22222222-2222-2222-2222-222222222222",
    phone_number: "+919876543210",
    full_name: "Test Customer",
    email: "customer@vsolve.test",
    roles: ["customer"],
  },
  session_expires_at: "2026-08-02T00:00:00Z",
};

interface Stub {
  apiClient: ApiClient;
  queue: (path: string, ...results: (() => Promise<unknown>)[]) => void;
  calls: { method: string; path: string; body?: unknown }[];
}

function createStub(): Stub {
  const queued = new Map<string, (() => Promise<unknown>)[]>();
  const calls: Stub["calls"] = [];

  const take = (path: string) => {
    const results = queued.get(path);
    if (!results || results.length === 0) return () => Promise.resolve(ok(null));
    const next = results.length === 1 ? results[0] : results.shift();
    return next ?? (() => Promise.resolve(ok(null)));
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

  const rendered = renderHook(() => useFirebasePhoneFlow(stub.apiClient, options), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return { ...rendered, queryClient };
}

describe("Firebase Phone Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPhoneNumber.mockReset();
    recaptchaInstanceCount = 0;
    recaptchaHosts = [];
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-api-key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "test.firebaseapp.com";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "test-project";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:12345:web:abcdef";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats Indian phone numbers to E.164 (+91)", () => {
    expect(formatToE164("9876543210")).toBe("+919876543210");
    expect(formatToE164("+919876543210")).toBe("+919876543210");
    expect(formatToE164("919876543210")).toBe("+919876543210");
    expect(formatToE164("98765 43210")).toBe("+919876543210");
  });

  it("maps Firebase errors without exposing raw strings", () => {
    expect(mapFirebaseError({ code: "auth/invalid-phone-number" })).toEqual({
      target: "phone",
      message: "Enter a valid mobile number",
    });
    expect(mapFirebaseError({ code: "auth/invalid-verification-code" })).toEqual({
      target: "code",
      message: "Incorrect OTP",
    });
    expect(mapFirebaseError({ code: "auth/code-expired" })).toEqual({
      target: "code",
      message: "OTP expired. Please resend",
    });
    expect(mapFirebaseError({ code: "auth/too-many-requests" }).message).toBe(
      "Too many attempts. Please try again later",
    );
    expect(mapFirebaseError({ code: "auth/quota-exceeded" }).message).toBe(
      "SMS limit reached. Please try again later",
    );
  });

  it("explains that Firebase phone auth refuses pages served from localhost", () => {
    const rejected = mapFirebaseError(
      { code: "auth/invalid-app-credential" },
      new URL("http://localhost:3000/login?next=%2Fcart"),
    );

    expect(rejected.target).toBe("failure");
    expect(rejected.message).toContain("auth/invalid-app-credential");
    expect(rejected.message).toContain("http://127.0.0.1:3000/login");
    expect(rejected.failure?.message).toBe(rejected.message);
  });

  it("reports the real verification code instead of one canned reCAPTCHA hint", () => {
    const loopback = new URL("http://127.0.0.1:3000/login");

    const captcha = mapFirebaseError({ code: "auth/captcha-check-failed" }, loopback).message;
    expect(captcha).toContain("auth/captcha-check-failed");
    expect(captcha).not.toContain("invalid-app-credential");
    expect(captcha).not.toContain("localhost");

    expect(
      mapFirebaseError(
        { code: "auth/unauthorized-domain" },
        new URL("https://staging.example.test/login"),
      ).message,
    ).toContain("staging.example.test is not an authorized domain");
    expect(
      mapFirebaseError({ code: "auth/firebase-app-check-token-is-invalid" }, loopback).message,
    ).toContain("App Check");
  });

  it("keeps verification failures generic in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const rejected = mapFirebaseError(
        { code: "auth/invalid-app-credential" },
        new URL("http://localhost:3000/login"),
      );
      expect(rejected.message).toBe("Verification failed. Please refresh and try again.");
      expect(rejected.failure?.message).toBe(rejected.message);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("executes full successful auth flow and caches session in TanStack Query", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () => Promise.resolve(ok(null, 204)));
    stub.queue("/api/v1/auth/firebase/verify/", () => Promise.resolve(ok(SESSION, 200)));

    const mockConfirm = vi.fn().mockResolvedValue({
      user: {
        getIdToken: vi.fn().mockResolvedValue("mock-firebase-id-token"),
      },
    });
    mockSignInWithPhoneNumber.mockResolvedValue({
      confirm: mockConfirm,
    });

    const onAuthenticated = vi.fn();
    const { result, queryClient } = renderFlow(stub, { onAuthenticated });

    // Step 1: Input phone
    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    expect(result.current.canRequest).toBe(true);

    // Step 2: Request code
    await act(async () => {
      result.current.onRequestCode();
    });

    // Precheck endpoint called with canonical E.164 phone
    expect(stub.calls[0]).toEqual({
      method: "POST",
      path: "/api/v1/auth/firebase/precheck/",
      body: { phone_number: "+919876543210", intended_role: "" },
    });

    // Firebase signInWithPhoneNumber called
    expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith(
      expect.anything(),
      "+919876543210",
      expect.any(RecaptchaVerifier),
    );

    expect(result.current.phase).toBe("code");
    expect(result.current.resendInSeconds).toBeGreaterThan(0);

    // Step 3: Enter 6-digit code
    act(() => {
      result.current.onCodeChange("123456");
    });
    expect(result.current.canVerify).toBe(true);

    // Step 4: Verify code
    await act(async () => {
      result.current.onVerifyCode();
    });

    expect(mockConfirm).toHaveBeenCalledWith("123456");
    expect(stub.calls[1]).toEqual({
      method: "POST",
      path: "/api/v1/auth/firebase/verify/",
      body: {
        id_token: "mock-firebase-id-token",
        intended_role: "",
      },
    });

    // Firebase signOut must be called so no Firebase auth session lingers
    expect(mockSignOut).toHaveBeenCalled();

    // QueryClient session cache updated
    const cachedSession = queryClient.getQueryData(queryKeys.session.current());
    expect(cachedSession).toEqual({
      user: SESSION.user,
      active_role: SESSION.active_role,
      session_expires_at: SESSION.session_expires_at,
    });

    expect(result.current.phase).toBe("authenticated");
    expect(result.current.signedInPhone).toBe("+919876543210");
    expect(onAuthenticated).toHaveBeenCalledWith(SESSION);
  });

  it("handles wrong OTP code error from Firebase", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () => Promise.resolve(ok(null, 204)));

    const mockConfirm = vi.fn().mockRejectedValue({
      code: "auth/invalid-verification-code",
    });
    mockSignInWithPhoneNumber.mockResolvedValue({
      confirm: mockConfirm,
    });

    const { result } = renderFlow(stub);

    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });

    act(() => {
      result.current.onCodeChange("000000");
    });
    await act(async () => {
      result.current.onVerifyCode();
    });

    expect(result.current.codeError).toBe("Incorrect OTP");
    expect(result.current.phase).toBe("code");
    // Verify POST should not have been called
    expect(stub.calls.length).toBe(1);
  });

  it("handles expired OTP code error from Firebase", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () => Promise.resolve(ok(null, 204)));

    const mockConfirm = vi.fn().mockRejectedValue({
      code: "auth/code-expired",
    });
    mockSignInWithPhoneNumber.mockResolvedValue({
      confirm: mockConfirm,
    });

    const { result } = renderFlow(stub);

    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });

    act(() => {
      result.current.onCodeChange("123456");
    });
    await act(async () => {
      result.current.onVerifyCode();
    });

    expect(result.current.codeError).toBe("OTP expired. Please resend");
    expect(result.current.phase).toBe("code");
  });

  it("handles precheck rate limiting (429 throttled) without calling Firebase", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () =>
      Promise.resolve(apiError(429, "throttled")),
    );

    const { result } = renderFlow(stub);

    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });

    expect(mockSignInWithPhoneNumber).not.toHaveBeenCalled();
    expect(result.current.failure?.kind).toBe("rate_limited");
    expect(result.current.failure?.message).toContain("Too many codes have been requested");
    expect(result.current.phase).toBe("phone");
  });

  it("handles partner role gate error (404 no_account_for_role) from precheck", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () =>
      Promise.resolve(apiError(404, "no_account_for_role")),
    );

    const { result } = renderFlow(stub, { intendedRole: "partner" });

    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });

    expect(mockSignInWithPhoneNumber).not.toHaveBeenCalled();
    expect(result.current.failure?.kind).toBe("no_account_for_role");
    expect(result.current.failure?.title).toBe("No Partner account found");
    expect(result.current.phase).toBe("phone");
  });

  it("asks Django about Operations access and never tells staff to become a Partner", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () =>
      Promise.resolve(apiError(404, "no_account_for_role")),
    );

    const { result } = renderFlow(stub, { intendedRole: "operations" });

    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });

    expect(stub.calls[0]?.body).toEqual({
      phone_number: "+919876543210",
      intended_role: "operations",
    });
    expect(mockSignInWithPhoneNumber).not.toHaveBeenCalled();
    expect(result.current.failure?.title).toBe("No Operations access");
    expect(result.current.failure?.message).not.toMatch(/partner/i);
  });

  it("clears and recreates RecaptchaVerifier after send error", async () => {
    const stub = createStub();
    stub.queue(
      "/api/v1/auth/firebase/precheck/",
      () => Promise.resolve(ok(null, 204)),
      () => Promise.resolve(ok(null, 204)),
    );

    // First attempt fails during signInWithPhoneNumber
    mockSignInWithPhoneNumber.mockRejectedValueOnce({
      code: "auth/captcha-check-failed",
    });

    // Second attempt succeeds
    mockSignInWithPhoneNumber.mockResolvedValueOnce({
      confirm: vi.fn(),
    });

    const { result } = renderFlow(stub);

    act(() => {
      result.current.onPhoneChange("9876543210");
    });

    // First attempt
    await act(async () => {
      result.current.onRequestCode();
    });

    expect(result.current.failure?.title).toBe("Verification failed");
    expect(mockRecaptchaClear).toHaveBeenCalledTimes(1);
    expect(recaptchaInstanceCount).toBe(1);

    // Second attempt should create a fresh RecaptchaVerifier
    await act(async () => {
      result.current.onRequestCode();
    });

    expect(recaptchaInstanceCount).toBe(2);
    expect(result.current.phase).toBe("code");
  });

  it("can send again after a failed send without reloading the page", async () => {
    // The production bug: the retry rendered into the element the first try had
    // used, reCAPTCHA refused, and the code-less error showed as "Something went
    // wrong" on every attempt until a reload.
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () => Promise.resolve(ok(null, 204)));
    sendLikeRecaptcha(() => Promise.reject({ code: "auth/too-many-requests" }));

    const { result } = renderFlow(stub);
    act(() => {
      result.current.onPhoneChange("9876543210");
    });

    await act(async () => {
      result.current.onRequestCode();
    });
    expect(result.current.failure?.kind).toBe("rate_limited");

    await act(async () => {
      result.current.onRequestCode();
    });

    expect(result.current.failure).toBeNull();
    expect(result.current.phase).toBe("code");
    expect(recaptchaHosts).toHaveLength(2);
    expect(recaptchaHosts[1]).not.toBe(recaptchaHosts[0]);
    // The discarded widget's element leaves the page with it.
    expect(recaptchaHosts[0]?.isConnected).toBe(false);
    expect(recaptchaHosts[1]?.isConnected).toBe(true);
  });

  it("can send again after the dialog is closed and reopened", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () => Promise.resolve(ok(null, 204)));
    // A send that never settles: a picture challenge nobody solved.
    sendLikeRecaptcha(() => new Promise(() => {}));

    const { result } = renderFlow(stub);
    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });
    await vi.waitFor(() => expect(recaptchaHosts).toHaveLength(1));
    expect(result.current.isRequesting).toBe(true);

    // Closing the login dialog resets the flow; the stuck send is abandoned.
    act(() => {
      result.current.reset();
      result.current.onPhoneChange("9876543210");
    });
    expect(result.current.isRequesting).toBe(false);
    expect(result.current.canRequest).toBe(true);

    await act(async () => {
      result.current.onRequestCode();
    });

    expect(result.current.failure).toBeNull();
    expect(result.current.phase).toBe("code");
    expect(recaptchaHosts[1]).not.toBe(recaptchaHosts[0]);
    expect(recaptchaHosts[0]?.isConnected).toBe(false);
  });

  it("keeps the verifier for Resend after a successful send", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () => Promise.resolve(ok(null, 204)));
    mockSignInWithPhoneNumber.mockResolvedValue({ confirm: vi.fn() });

    const { result } = renderFlow(stub);
    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });

    expect(recaptchaInstanceCount).toBe(1);
    expect(recaptchaHosts[0]?.isConnected).toBe(true);
    expect(mockRecaptchaClear).not.toHaveBeenCalled();
  });

  it("gives every Operations step-up its own reCAPTCHA element", async () => {
    sendLikeRecaptcha(() => Promise.resolve({ confirm: vi.fn() }));

    await startFirebasePhoneVerification("9876543210");
    await startFirebasePhoneVerification("9876543210");

    expect(mockSignInWithPhoneNumber).toHaveBeenCalledTimes(2);
    expect(recaptchaHosts).toHaveLength(2);
    expect(recaptchaHosts[1]).not.toBe(recaptchaHosts[0]);
    // Only the send needs reCAPTCHA, so neither element outlives it.
    expect(recaptchaHosts.every((host) => !host.isConnected)).toBe(true);
  });

  it("cleans up RecaptchaVerifier on unmount", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () => Promise.resolve(ok(null, 204)));
    mockSignInWithPhoneNumber.mockResolvedValue({
      confirm: vi.fn(),
    });

    const { result, unmount } = renderFlow(stub);

    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });

    expect(mockRecaptchaClear).not.toHaveBeenCalled();

    unmount();

    expect(mockRecaptchaClear).toHaveBeenCalled();
  });

  it("resets flow to phone step when backend verify fails and never resubmits the spent token", async () => {
    const stub = createStub();
    stub.queue("/api/v1/auth/firebase/precheck/", () => Promise.resolve(ok(null, 204)));
    // Backend answers 400 invalid_otp
    stub.queue("/api/v1/auth/firebase/verify/", () =>
      Promise.resolve(apiError(400, "invalid_otp")),
    );

    const mockConfirm = vi.fn().mockResolvedValue({
      user: {
        getIdToken: vi.fn().mockResolvedValue("single-use-id-token-123"),
      },
    });
    mockSignInWithPhoneNumber.mockResolvedValue({
      confirm: mockConfirm,
    });

    const { result } = renderFlow(stub);

    act(() => {
      result.current.onPhoneChange("9876543210");
    });
    await act(async () => {
      result.current.onRequestCode();
    });

    expect(result.current.phase).toBe("code");

    act(() => {
      result.current.onCodeChange("123456");
    });
    expect(result.current.canVerify).toBe(true);

    await act(async () => {
      result.current.onVerifyCode();
    });

    // 1. Verify endpoint was called exactly once (no retries)
    const verifyCalls = stub.calls.filter((c) => c.path === "/api/v1/auth/firebase/verify/");
    expect(verifyCalls.length).toBe(1);

    // 2. Flow resets back to phone step
    expect(result.current.phase).toBe("phone");
    expect(result.current.code).toBe("");
    expect(result.current.phone).toBe("9876543210");
    expect(result.current.canVerify).toBe(false);
    expect(result.current.phoneError).toContain("That code is not right, or it has expired");

    // 3. Resend timer is reset so user can request a fresh code immediately
    expect(result.current.resendInSeconds).toBe(0);
    expect(result.current.canRequest).toBe(true);

    // 4. Calling onVerifyCode again cannot submit because verification in progress is dropped
    await act(async () => {
      result.current.onVerifyCode();
    });
    expect(stub.calls.filter((c) => c.path === "/api/v1/auth/firebase/verify/").length).toBe(1);
  });

  it("logs the Firebase error code in every environment, and never the phone, OTP or token", () => {
    const originalEnv = process.env.NODE_ENV;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = {
      code: "auth/invalid-verification-code",
      message: "Secret phone 9876543210 and OTP 123456 token eyJhbGciOi...",
    };

    try {
      for (const env of ["production", "development"]) {
        consoleSpy.mockClear();
        process.env.NODE_ENV = env;
        mapFirebaseError(error);

        // Production shows customers generic copy, so this is the only record
        // of why a send failed.
        expect(consoleSpy).toHaveBeenCalledWith(
          "[Firebase Auth error]",
          "auth/invalid-verification-code",
        );
        const loggedArgs = consoleSpy.mock.calls.flat().join(" ");
        expect(loggedArgs).not.toContain("9876543210");
        expect(loggedArgs).not.toContain("123456");
        expect(loggedArgs).not.toContain("eyJ");
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    }
  });
});
