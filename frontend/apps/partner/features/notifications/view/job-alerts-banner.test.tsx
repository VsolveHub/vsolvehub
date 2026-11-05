// @vitest-environment jsdom
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from "vitest";
import { JobAlertsBanner } from "./job-alerts-banner";
import { I18nProvider } from "@vsolve/ui";

type OneSignalTestWindow = {
  OneSignal: {
    User?: unknown;
    Notifications: { permissionNative: NotificationPermission; requestPermission: Mock };
  };
  OneSignalDeferred: unknown[];
};
const testWindow = window as unknown as OneSignalTestWindow;
const mutableNotification = () =>
  globalThis.Notification as unknown as { permission: NotificationPermission };

// Mock @vsolve/query session
vi.mock("@vsolve/query", () => ({
  useCurrentSession: () => ({
    data: { user: { id: "partner-test-user-123" } },
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/portal",
}));

describe("JobAlertsBanner (Partner Permission UX)", () => {
  const originalNotification = globalThis.Notification;
  let dispatchedAnalytics: CustomEvent[] = [];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    dispatchedAnalytics = [];

    window.addEventListener("vsh:analytics", (e) => {
      dispatchedAnalytics.push(e as CustomEvent);
    });

    globalThis.Notification = {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    } as unknown as typeof Notification;

    testWindow.OneSignal = {
      User: {
        PushSubscription: {
          id: "sub-part-1",
          optedIn: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          optIn: vi.fn().mockResolvedValue(undefined),
        },
      },
      Notifications: {
        permissionNative: "default",
        requestPermission: vi.fn().mockResolvedValue(true),
      },
    };
    testWindow.OneSignalDeferred = [];
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
    Reflect.deleteProperty(window, "OneSignal");
    Reflect.deleteProperty(window, "OneSignalDeferred");
    vi.restoreAllMocks();
  });

  it("does not render or prompt automatically on page load or login", () => {
    render(<JobAlertsBanner />);

    expect(screen.queryByText("Never miss nearby job alerts")).not.toBeInTheDocument();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("appears when partner taps Go Online and requests permission only on explicit CTA click", async () => {
    const onProceed = vi.fn();
    render(<JobAlertsBanner />);

    // Partner taps "Go Online", presence panel dispatches event
    act(() => {
      window.dispatchEvent(
        new CustomEvent("vsh:open-job-alerts-prompt", {
          detail: { onProceed },
        }),
      );
    });

    // Custom pre-permission modal is displayed
    expect(screen.getByText("Never miss nearby job alerts")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Turn on notifications to get instant alerts when a nearby Instant Booking becomes available—even when the app is in the background.",
      ),
    ).toBeInTheDocument();

    // Native permission has NOT been requested yet
    expect(Notification.requestPermission).not.toHaveBeenCalled();

    // Explicit primary CTA click
    const enableBtn = screen.getByRole("button", { name: "Enable job alerts & Go Online" });
    await act(async () => {
      fireEvent.click(enableBtn);
    });

    // Native permission now requested
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);

    // Modal closes and shift start proceeds
    await waitFor(() => {
      expect(onProceed).toHaveBeenCalledTimes(1);
    });

    const grantAnalytics = dispatchedAnalytics.find(
      (e) => e.detail.event === "partner_push_permission_granted",
    );
    expect(grantAnalytics).toBeDefined();
  });

  it("shows recovery guidance when permission is denied and requires permission before going online", async () => {
    vi.mocked(Notification.requestPermission).mockResolvedValue("denied");
    testWindow.OneSignal.Notifications.requestPermission.mockResolvedValue(false);

    const onProceed = vi.fn();
    render(<JobAlertsBanner />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("vsh:open-job-alerts-prompt", {
          detail: { onProceed },
        }),
      );
    });

    const enableBtn = screen.getByRole("button", { name: "Enable job alerts & Go Online" });
    await act(async () => {
      fireEvent.click(enableBtn);
    });

    // Transitions to denied recovery UI
    expect(screen.getByText("Notifications are blocked in your browser")).toBeInTheDocument();
    expect(
      screen.getByText(
        "To receive instant job alerts, click the lock/settings icon in your browser address bar and set Notifications to Allow.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show me how/i })).toBeInTheDocument();

    // Verify "Stay Offline" keeps partner offline
    const stayOfflineBtn = screen.getByRole("button", { name: "Stay Offline" });
    act(() => {
      fireEvent.click(stayOfflineBtn);
    });
    expect(onProceed).not.toHaveBeenCalled();

    // Re-open with permission set to denied
    mutableNotification().permission = "denied";
    act(() => {
      window.dispatchEvent(
        new CustomEvent("vsh:open-job-alerts-prompt", {
          detail: { onProceed },
        }),
      );
    });

    const verifyBtn = screen.getByRole("button", { name: "I've allowed it — Go Online" });
    await act(async () => {
      fireEvent.click(verifyBtn);
    });
    // Still denied: does not call onProceed and shows error
    expect(onProceed).not.toHaveBeenCalled();
    expect(screen.getByText(/Notifications are still blocked in your browser/i)).toBeInTheDocument();

    // Now user unblocks in browser: permission becomes granted
    mutableNotification().permission = "granted";
    await act(async () => {
      fireEvent.click(verifyBtn);
    });
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it("staying offline closes modal and keeps partner offline", () => {
    const onProceed = vi.fn();
    render(<JobAlertsBanner />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("vsh:open-job-alerts-prompt", {
          detail: { onProceed },
        }),
      );
    });

    const stayOfflineBtn = screen.getByRole("button", { name: "Stay Offline" });
    act(() => {
      fireEvent.click(stayOfflineBtn);
    });

    // Partner stays offline: onProceed is NOT called
    expect(onProceed).not.toHaveBeenCalled();
    expect(screen.queryByText("Never miss nearby job alerts")).not.toBeInTheDocument();
  });

  it("unsupported browser does not show prompt and continues shift start", () => {
    const savedNotification = globalThis.Notification;
    try {
      // @ts-expect-error simulating unsupported browser
      delete globalThis.Notification;

      const onProceed = vi.fn();
      render(<JobAlertsBanner />);

      act(() => {
        window.dispatchEvent(
          new CustomEvent("vsh:open-job-alerts-prompt", {
            detail: { onProceed },
          }),
        );
      });

      expect(screen.queryByText("Never miss nearby job alerts")).not.toBeInTheDocument();
      expect(onProceed).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.Notification = savedNotification;
    }
  });

  it("renders pure Hindi when hi-IN locale is active without mixing English", () => {
    mutableNotification().permission = "denied";
    render(
      <I18nProvider locale="hi-IN" catalog={{}}>
        <JobAlertsBanner />
      </I18nProvider>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("vsh:open-job-alerts-prompt", {
          detail: { onProceed: vi.fn() },
        }),
      );
    });

    // Check pure Hindi title and buttons with no English mixed in
    expect(screen.getByText("ब्राउज़र में नोटिफिकेशन ब्लॉक हैं")).toBeInTheDocument();
    expect(screen.getByText("स्क्रीन के सबसे ऊपर 🔒 लॉक आइकॉन दबाएं")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow कर दिया — Go Online" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ऑफलाइन रहें" })).toBeInTheDocument();
  });
});

