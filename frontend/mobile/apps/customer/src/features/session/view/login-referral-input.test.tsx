// Ported from frontend/apps/customer/features/session/view/login-referral-input.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { clearPendingReferral, readPendingReferral } from "@/features/referral/pending-referral";
import { LoginReferralInput } from "./login-referral-input";

const mockPost = jest.fn();

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => ({
    POST: (...args: unknown[]) => mockPost(...args),
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function TestWrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("LoginReferralInput", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingReferral();
    queryClient.clear();
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("renders closed by default and opens on press", async () => {
    const view = await render(<LoginReferralInput />, { wrapper: TestWrapper });

    const openButton = view.getByText("Have an invite code? Apply it only at signup");
    expect(openButton).toBeTruthy();

    await act(async () => {
      fireEvent.press(openButton);
    });

    expect(view.getByText("Referral Invite")).toBeTruthy();
    expect(view.getByPlaceholderText("e.g. VS9876A1")).toBeTruthy();
  });

  it("validates and applies a valid referral code", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        valid: true,
        code: "FRIEND100",
        referrer_id: "u-123",
        referee_reward_summary: "₹100 discount applied on first booking!",
      },
      response: new Response(),
    });

    const view = await render(<LoginReferralInput />, { wrapper: TestWrapper });

    await act(async () => {
      fireEvent.press(view.getByText("Have an invite code? Apply it only at signup"));
    });

    const input = view.getByPlaceholderText("e.g. VS9876A1");
    await act(async () => {
      fireEvent.changeText(input, "friend100");
    });

    const applyButton = view.getByText("Apply");
    await act(async () => {
      fireEvent.press(applyButton);
    });

    await waitFor(() => {
      expect(view.getByText("Applied")).toBeTruthy();
      expect(view.getByText("₹100 discount applied on first booking!")).toBeTruthy();
    });

    expect(readPendingReferral()).toBe("FRIEND100");
    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/customer/referral/validate/",
      expect.objectContaining({
        body: { code: "FRIEND100" },
      }),
    );
  });

  it("shows an error when code is invalid", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        valid: false,
      },
      response: new Response(),
    });

    const view = await render(<LoginReferralInput />, { wrapper: TestWrapper });

    await act(async () => {
      fireEvent.press(view.getByText("Have an invite code? Apply it only at signup"));
    });

    const input = view.getByPlaceholderText("e.g. VS9876A1");
    await act(async () => {
      fireEvent.changeText(input, "WRONGCODE");
    });

    await act(async () => {
      fireEvent.press(view.getByText("Apply"));
    });

    await waitFor(() => {
      expect(view.getByText("Invalid referral code")).toBeTruthy();
    });

    expect(readPendingReferral()).toBeNull();
  });
});
