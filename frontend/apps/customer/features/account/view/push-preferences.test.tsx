// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CustomerPushPreferencesSection } from "./push-preferences";
import { CUSTOMER_DISMISS_KEY } from "@vsolve/ui";
import { ok } from "../fixtures";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));


const mockCustomerPrefs = {
  role: "CUSTOMER",
  preferences: [
    {
      category: "BOOKING_UPDATES",
      label: "Booking Updates",
      description: "Confirmations, rescheduling, and status changes for your active bookings.",
      is_enabled: true,
      is_mutable: true,
    },
    {
      category: "DISPATCH_AND_ASSIGNMENT_UPDATES",
      label: "Dispatch & Assignment Updates",
      description: "Real-time alerts when a professional accepts and is assigned to your job.",
      is_enabled: true,
      is_mutable: true,
    },
    {
      category: "ARRIVAL_AND_OTP_ALERTS",
      label: "Arrival & OTP Alerts",
      description: "Immediate notifications when your professional arrives with the start-work code.",
      is_enabled: true,
      is_mutable: true,
    },
    {
      category: "ACCOUNT_SECURITY",
      label: "Account Security",
      description: "Critical login alerts, password changes, and security notices.",
      is_enabled: true,
      is_mutable: false,
    },
    {
      category: "OFFERS_AND_PROMOTIONS",
      label: "Offers & Promotions",
      description: "Discounts, seasonal deals, and service recommendations.",
      is_enabled: false,
      is_mutable: true,
    },
  ],
};

describe("CustomerPushPreferencesSection", () => {
  let queryClient: QueryClient;
  const originalNotification = globalThis.Notification;
  let dispatchedEvents: CustomEvent[] = [];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    dispatchedEvents = [];

    window.addEventListener("vsh:analytics", (e) => {
      dispatchedEvents.push(e as CustomEvent);
    });

    globalThis.Notification = {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    } as unknown as typeof Notification;

    (window as any).OneSignal = {
      User: {
        PushSubscription: {
          id: "sub-customer-test",
          optedIn: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          optIn: vi.fn().mockResolvedValue(undefined),
          optOut: vi.fn().mockResolvedValue(undefined),
        },
      },
      Notifications: {
        permissionNative: "default",
        requestPermission: vi.fn().mockResolvedValue(true),
      },
    };
    (window as any).OneSignalDeferred = [];

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    client.GET.mockImplementation((path: string) => {
      if (path.includes("/api/v1/customer/notification-preferences/")) {
        return Promise.resolve(ok(mockCustomerPrefs));
      }
      return Promise.resolve(ok({}));
    });
    client.PATCH.mockImplementation((path: string, options?: any) => {
      if (path.includes("/api/v1/customer/notification-preferences/")) {
        const body = options?.body || {};
        const updated = {
          ...mockCustomerPrefs,
          preferences: mockCustomerPrefs.preferences.map((p) =>
            p.category === body.category ? { ...p, is_enabled: body.is_enabled } : p
          ),
        };
        return Promise.resolve(ok(updated));
      }
      return Promise.resolve(ok({}));
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/api/v1/auth/csrf/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ csrf_token: "csrf-tok-cust" }),
          });
        }
        if (url.includes("/api/v1/customer/push-subscriptions/sync/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true }),
          });
        }
        return Promise.reject(new Error("Unknown URL: " + url));
      })
    );
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
    delete (window as any).OneSignal;
    delete (window as any).OneSignalDeferred;
    vi.restoreAllMocks();
  });

  it("renders push preference categories with security locked", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CustomerPushPreferencesSection />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Booking Updates")).toBeDefined();
    expect(screen.getByText("Dispatch & Assignment Updates")).toBeDefined();
    expect(screen.getByText("Account Security")).toBeDefined();
    expect(screen.getByText("Offers & Promotions")).toBeDefined();

    // Security badge is Required
    expect(screen.getByText("Required")).toBeDefined();

    // Account security checkbox is disabled (immutable)
    const secCheckbox = screen.getByLabelText(/Account Security push notifications/i) as HTMLInputElement;
    expect(secCheckbox.disabled).toBe(true);
    expect(secCheckbox.checked).toBe(true);
  });

  it("toggles mutable preference and sends PATCH", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CustomerPushPreferencesSection />
      </QueryClientProvider>
    );

    const bookingCheckbox = (await screen.findByLabelText(
      /Booking Updates push notifications/i
    )) as HTMLInputElement;
    expect(bookingCheckbox.checked).toBe(true);

    fireEvent.click(bookingCheckbox);

    await waitFor(() => {
      expect(client.PATCH).toHaveBeenCalledWith(
        "/api/v1/customer/notification-preferences/",
        expect.objectContaining({
          body: { category: "BOOKING_UPDATES", is_enabled: false },
        })
      );
    });
  });

  it("renders default state with active 14-day cooldown and enables notifications on click", async () => {
    // Set active 14-day cooldown in localStorage
    const now = Date.now();
    localStorage.setItem(CUSTOMER_DISMISS_KEY, String(now));

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerPushPreferencesSection />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Get real-time booking updates")).toBeDefined();
    const enableBtn = screen.getByRole("button", { name: "Turn on live updates" });
    expect(enableBtn).toBeDefined();

    // Click enable CTA
    fireEvent.click(enableBtn);

    await waitFor(() => {
      // 1. Tracks analytics event
      const clickEvent = dispatchedEvents.find(
        (e) => e.detail?.event === "customer_push_manual_enable_clicked"
      );
      expect(clickEvent).toBeDefined();
      expect(clickEvent?.detail?.properties?.role).toBe("CUSTOMER");

      // 2. Cooldown timestamp was removed from localStorage on grant
      expect(localStorage.getItem(CUSTOMER_DISMISS_KEY)).toBeNull();

      // 3. Customer sync endpoint was targeted (/api/v1/customer/push-subscriptions/sync/)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/customer/push-subscriptions/sync/"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });

  it("renders granted state with Notifications active badge and no enable button", async () => {
    (globalThis.Notification as any).permission = "granted";
    (window as any).OneSignal.Notifications.permissionNative = "granted";

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerPushPreferencesSection />
      </QueryClientProvider>
    );

    const activeBadges = await screen.findAllByText("Notifications active");
    expect(activeBadges.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Turn on live updates" })).toBeNull();
  });

  it("renders denied state with Notifications blocked in browser and does not show enable button", async () => {
    (globalThis.Notification as any).permission = "denied";
    (window as any).OneSignal.Notifications.permissionNative = "denied";

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerPushPreferencesSection />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Notifications blocked in browser")).toBeDefined();
    expect(screen.getByText("Blocked in browser")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Turn on live updates" })).toBeNull();

    // Verify Notification.requestPermission was NOT called
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect((window as any).OneSignal.Notifications.requestPermission).not.toHaveBeenCalled();
  });

  it("renders unsupported state when Notification API is not available", async () => {
    // @ts-expect-error simulating unsupported browser
    delete globalThis.Notification;

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerPushPreferencesSection />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Push notifications are not supported on this browser.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Turn on live updates" })).toBeNull();
  });
});
