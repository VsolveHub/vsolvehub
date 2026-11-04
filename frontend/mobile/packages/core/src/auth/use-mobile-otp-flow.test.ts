import { act, renderHook } from "@testing-library/react-native";

import { useMobileOtpFlow } from "./use-mobile-otp-flow";

const mockPost = jest.fn();

jest.mock("../api/client", () => ({
  getApiClient: () => ({
    POST: (...args: unknown[]) => mockPost(...args),
  }),
}));

jest.mock("./token-store", () => {
  let value: string | null = null;
  return {
    loadToken: jest.fn(async () => value),
    saveToken: jest.fn(async (t: string) => {
      value = t;
    }),
    clearToken: jest.fn(async () => {
      value = null;
    }),
  };
});

jest.mock("./installation-id", () => ({
  installationId: async () => "test-device-id",
}));

jest.mock("./device-label", () => ({
  deviceLabel: () => "Test Phone",
}));

jest.mock("./firebase-module", () => ({
  phoneAuthProvider: () => "server",
}));

describe("useMobileOtpFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends referral_code on verify when getReferralCode provides one", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/otp/request/") {
        return {
          data: {
            challenge_id: "ch-123",
            code_length: 6,
            development_code: "123456",
            resend_after_seconds: 60,
            expires_in_seconds: 300,
          },
          response: new Response(),
        };
      }
      if (path === "/api/v1/auth/mobile/otp/verify/") {
        return {
          data: {
            session_token: "token-abc",
          },
          response: new Response(),
        };
      }
      return { data: {}, response: new Response() };
    });

    const { result } = await renderHook(() =>
      useMobileOtpFlow({
        getReferralCode: () => "VSOLVE999",
      }),
    );

    await act(async () => {
      result.current.onPhoneChange("9876543210");
    });

    await act(async () => {
      result.current.onRequestCode();
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/auth/otp/request/",
      expect.objectContaining({
        body: expect.objectContaining({
          phone_number: "9876543210",
        }),
      }),
    );

    await act(async () => {
      result.current.onVerifyCode("123456");
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/auth/mobile/otp/verify/",
      expect.objectContaining({
        body: expect.objectContaining({
          challenge_id: "ch-123",
          code: "123456",
          referral_code: "VSOLVE999",
        }),
      }),
    );
  });

  it("does not send referral_code when getReferralCode returns null", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === "/api/v1/auth/otp/request/") {
        return {
          data: {
            challenge_id: "ch-456",
            code_length: 6,
            development_code: "654321",
            resend_after_seconds: 60,
            expires_in_seconds: 300,
          },
          response: new Response(),
        };
      }
      if (path === "/api/v1/auth/mobile/otp/verify/") {
        return {
          data: {
            session_token: "token-def",
          },
          response: new Response(),
        };
      }
      return { data: {}, response: new Response() };
    });

    const { result } = await renderHook(() =>
      useMobileOtpFlow({
        getReferralCode: () => null,
      }),
    );

    await act(async () => {
      result.current.onPhoneChange("9876543211");
    });

    await act(async () => {
      result.current.onRequestCode();
    });

    await act(async () => {
      result.current.onVerifyCode("654321");
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/auth/mobile/otp/verify/",
      expect.objectContaining({
        body: expect.not.objectContaining({
          referral_code: expect.anything(),
        }),
      }),
    );
  });
});
