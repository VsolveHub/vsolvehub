// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PartnerPushPreferencesCard } from "./partner-push-preferences";
import { PARTNER_DISMISS_KEY } from "@vsolve/ui";

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

describe("PartnerPushPreferencesCard", () => {
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
          id: "sub-partner-test",
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

    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    }

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/api/v1/partner/notification-preferences/")) {
          if (init?.method === "PATCH") {
            const body = JSON.parse(init.body as string);
            const updated = {
              ...mockPreferences,
              preferences: mockPreferences.preferences.map((p) =>
                p.category === body.category ? { ...p, is_enabled: body.is_enabled } : p
              ),
            };
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(updated),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPreferences),
          });
        }
        if (url.includes("/api/v1/auth/csrf/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ csrf_token: "csrf-tok" }),
          });
        }
        if (url.includes("/api/v1/partner/push-subscriptions/sync/")) {
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

  it("renders partner preferences with categories and locked state for security", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PartnerPushPreferencesCard />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Push Notification Settings")).toBeDefined();
    expect(screen.getByText("Job & Dispatch Alerts")).toBeDefined();
    expect(screen.getByText("Account Security")).toBeDefined();
    expect(screen.getByText("Required")).toBeDefined();
  });

  it("shows warning modal when attempting to disable job alerts", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PartnerPushPreferencesCard />
      </QueryClientProvider>
    );

    const jobCheckbox = await screen.findByLabelText(/Job & Dispatch Alerts push notifications/i);
    expect(jobCheckbox).toBeDefined();

    // Toggling job alerts OFF should trigger the confirmation warning dialog
    fireEvent.click(jobCheckbox);

    expect(await screen.findByText("Disable Job & Dispatch Alerts?")).toBeDefined();
    expect(screen.getByText(/Disabling job alerts means you will not receive sound or banner/i)).toBeDefined();

    // Confirm disabling
    const confirmBtn = screen.getByRole("button", { name: "Disable Alerts" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/partner/notification-preferences/",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ category: "JOB_AND_DISPATCH_ALERTS", is_enabled: false }),
        })
      );
    });
  });

  it("renders default state with active cooldown and enables job alerts on click", async () => {
    // Set active 7-day cooldown in localStorage
    const now = Date.now();
    localStorage.setItem(PARTNER_DISMISS_KEY, String(now));

    render(
      <QueryClientProvider client={queryClient}>
        <PartnerPushPreferencesCard />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Browser alerts disabled")).toBeDefined();
    const enableBtn = screen.getByRole("button", { name: "Enable job alerts" });
    expect(enableBtn).toBeDefined();

    // Click enable CTA
    fireEvent.click(enableBtn);

    await waitFor(() => {
      // 1. Tracks analytics event
      const clickEvent = dispatchedEvents.find(
        (e) => e.detail?.event === "partner_push_manual_enable_clicked"
      );
      expect(clickEvent).toBeDefined();
      expect(clickEvent?.detail?.properties?.role).toBe("PARTNER");

      // 2. Cooldown timestamp was removed from localStorage on grant
      expect(localStorage.getItem(PARTNER_DISMISS_KEY)).toBeNull();

      // 3. Partner sync endpoint was called
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/partner/push-subscriptions/sync/"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });

  it("renders granted state with Live alerts active badge and no enable button", async () => {
    (globalThis.Notification as any).permission = "granted";
    (window as any).OneSignal.Notifications.permissionNative = "granted";

    render(
      <QueryClientProvider client={queryClient}>
        <PartnerPushPreferencesCard />
      </QueryClientProvider>
    );

    const activeBadges = await screen.findAllByText("Live alerts active");
    expect(activeBadges.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Enable job alerts" })).toBeNull();
  });

  it("renders denied state with Blocked in browser badge and opens how-to modal without requesting permission", async () => {
    (globalThis.Notification as any).permission = "denied";
    (window as any).OneSignal.Notifications.permissionNative = "denied";

    render(
      <QueryClientProvider client={queryClient}>
        <PartnerPushPreferencesCard />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Notifications are blocked in your browser")).toBeDefined();
    expect(screen.getByText("Blocked in browser")).toBeDefined();

    const howToBtn = screen.getByRole("button", { name: "Show me how" });
    expect(howToBtn).toBeDefined();

    fireEvent.click(howToBtn);

    expect(await screen.findByText("Unblock Notifications in Browser")).toBeDefined();
    expect(screen.getByText(/Click the padlock \/ site settings icon/i)).toBeDefined();

    // Verify Notification.requestPermission was NOT called
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect((window as any).OneSignal.Notifications.requestPermission).not.toHaveBeenCalled();
  });

  it("renders unsupported state when Notification API is not available", async () => {
    // @ts-expect-error simulating unsupported browser
    delete globalThis.Notification;

    render(
      <QueryClientProvider client={queryClient}>
        <PartnerPushPreferencesCard />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Web push is not supported on this browser or device.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Enable job alerts" })).toBeNull();
  });
});
