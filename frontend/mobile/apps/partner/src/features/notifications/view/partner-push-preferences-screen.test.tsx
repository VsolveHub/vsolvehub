/* eslint-disable @typescript-eslint/no-require-imports */
// Ported from frontend/apps/partner/features/notifications/view/partner-push-preferences.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { PartnerPushPreferencesScreen } from "./partner-push-preferences-screen";

jest.setTimeout(15000);

const mockClient = {
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: jest.fn(),
  PUT: jest.fn(),
  DELETE: jest.fn(),
};

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  // Expo Go: OneSignal cannot run, so the phone reports push as unavailable.
  pushPermission: async () => "unavailable",
  enablePush: jest.fn(async () => "unavailable"),
}));

jest.mock("expo-blur", () => ({
  BlurView: require("react-native").View,
}));

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

const mockPreferences = {
  role: "PARTNER",
  preferences: [
    {
      category: "JOB_AND_DISPATCH_ALERTS",
      label: "Job & Dispatch Alerts",
      description: "Instant booking dispatch offers nearby.",
      is_enabled: true,
      is_mutable: true,
    },
    {
      category: "SHIFT_AND_AVAILABILITY_REMINDERS",
      label: "Shift & Availability Reminders",
      description: "Reminders to go online before peak demand windows.",
      is_enabled: true,
      is_mutable: true,
    },
    {
      category: "ACCOUNT_SECURITY",
      label: "Account Security",
      description: "Critical login alerts and account notices.",
      is_enabled: true,
      is_mutable: false,
    },
    {
      category: "PRODUCT_UPDATES",
      label: "Product Updates",
      description: "New features and platform updates.",
      is_enabled: true,
      is_mutable: true,
    },
  ],
};

describe("PartnerPushPreferencesScreen", () => {
  let queryClient: QueryClient;

  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("renders partner preferences with categories and locked state for security", async () => {
    mockClient.GET.mockResolvedValue(ok(mockPreferences));

    const view = await render(<PartnerPushPreferencesScreen />, { wrapper: QueryWrapper });

    expect(await view.findByText("Push Notification Settings")).toBeTruthy();
    expect(await view.findByText("Job & Dispatch Alerts")).toBeTruthy();
    expect(await view.findByText("Account Security")).toBeTruthy();
    expect(await view.findByText("Required")).toBeTruthy();
    expect(
      await view.findByText("Notifications are not available in Expo Go. They work in the installed app."),
    ).toBeTruthy();
  });

  it("shows warning modal when attempting to disable job alerts", async () => {
    mockClient.GET.mockResolvedValue(ok(mockPreferences));
    mockClient.PATCH.mockResolvedValue(
      ok({
        ...mockPreferences,
        preferences: mockPreferences.preferences.map((p) =>
          p.category === "JOB_AND_DISPATCH_ALERTS" ? { ...p, is_enabled: false } : p,
        ),
      }),
    );

    const view = await render(<PartnerPushPreferencesScreen />, { wrapper: QueryWrapper });

    const jobSwitch = await view.findByLabelText("Job & Dispatch Alerts push notifications");
    expect(jobSwitch).toBeTruthy();

    // Toggling job alerts OFF should trigger the confirmation warning dialog
    fireEvent(jobSwitch, "valueChange", false);

    expect(await view.findByText("Disable Job & Dispatch Alerts?")).toBeTruthy();
    expect(
      view.getByText(
        /Disabling job alerts means you will not receive sound or banner notifications/i,
      ),
    ).toBeTruthy();

    // Confirm disabling
    const confirmBtn = view.getByText("Disable Alerts");
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(mockClient.PATCH).toHaveBeenCalledWith(
        "/api/v1/partner/notification-preferences/",
        expect.objectContaining({
          body: { category: "JOB_AND_DISPATCH_ALERTS", is_enabled: false },
        }),
      );
    });
  });

  it("renders error state when query fails and allows retry", async () => {
    mockClient.GET.mockRejectedValue(new Error("Network failed"));

    const view = await render(<PartnerPushPreferencesScreen />, { wrapper: QueryWrapper });

    expect(await view.findByText("Could not load notification preferences")).toBeTruthy();
    const retryBtn = view.getByText("Retry");

    mockClient.GET.mockResolvedValue(ok(mockPreferences));
    fireEvent.press(retryBtn);

    expect(await view.findByText("Job & Dispatch Alerts")).toBeTruthy();
  });
});
