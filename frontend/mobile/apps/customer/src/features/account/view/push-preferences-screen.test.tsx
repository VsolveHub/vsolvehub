// Ported from frontend/apps/customer/features/account/view/push-preferences.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { PushPreferencesScreen } from "./push-preferences-screen";

const mockClient = {
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: jest.fn(),
  PUT: jest.fn(),
  DELETE: jest.fn(),
};

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  getNotifications: () => null,
  notificationsUnavailable: true,
  registerForPush: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

const mockPreferences = {
  role: "CUSTOMER",
  preferences: [
    {
      category: "BOOKING_UPDATES",
      label: "Booking Updates",
      description: "Arrival, progress and completion notices for your bookings.",
      is_enabled: true,
      is_mutable: true,
    },
    {
      category: "ACCOUNT_SECURITY",
      label: "Account Security",
      description: "Critical security notices and account verification alerts.",
      is_enabled: true,
      is_mutable: false,
    },
    {
      category: "MARKETING",
      label: "Special Offers",
      description: "Promotions and seasonal discounts.",
      is_enabled: false,
      is_mutable: true,
    },
  ],
};

describe("PushPreferencesScreen", () => {
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

  it("renders preferences with categories and locked state for security", async () => {
    mockClient.GET.mockResolvedValue(ok(mockPreferences));

    const view = await render(<PushPreferencesScreen embedded />, { wrapper: QueryWrapper });

    expect(await view.findByText("Push Notifications")).toBeTruthy();
    expect(await view.findByText("Booking Updates")).toBeTruthy();
    expect(await view.findByText("Account Security")).toBeTruthy();
    expect(await view.findByText("Required")).toBeTruthy();
    expect(
      await view.findByText("Notifications are not available in Expo Go. They work in the installed app."),
    ).toBeTruthy();
  });

  it("toggles mutable preference switch", async () => {
    mockClient.GET.mockResolvedValue(ok(mockPreferences));
    mockClient.PATCH.mockResolvedValue(
      ok({
        ...mockPreferences,
        preferences: mockPreferences.preferences.map((p) =>
          p.category === "BOOKING_UPDATES" ? { ...p, is_enabled: false } : p,
        ),
      }),
    );

    const view = await render(<PushPreferencesScreen embedded />, { wrapper: QueryWrapper });

    const bookingSwitch = await view.findByLabelText("Booking Updates push notifications");
    expect(bookingSwitch).toBeTruthy();

    fireEvent(bookingSwitch, "valueChange", false);

    await waitFor(() => {
      expect(mockClient.PATCH).toHaveBeenCalledWith(
        "/api/v1/customer/notification-preferences/",
        expect.objectContaining({
          body: { category: "BOOKING_UPDATES", is_enabled: false },
        }),
      );
    });
  });

  it("renders error state when query fails and allows retry", async () => {
    mockClient.GET.mockRejectedValue(new Error("Network failed"));

    const view = await render(<PushPreferencesScreen embedded />, { wrapper: QueryWrapper });

    expect(await view.findByText("We could not load your push notification settings")).toBeTruthy();
    const retryBtn = view.getByText("Try again");

    mockClient.GET.mockResolvedValue(ok(mockPreferences));
    fireEvent.press(retryBtn);

    expect(await view.findByText("Booking Updates")).toBeTruthy();
  });
});

