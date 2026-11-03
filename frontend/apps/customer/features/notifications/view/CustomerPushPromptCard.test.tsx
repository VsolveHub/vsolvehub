// @vitest-environment jsdom
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CustomerPushPromptCard } from "./CustomerPushPromptCard";
import { CUSTOMER_DISMISS_KEY } from "@vsolve/ui";

// Mock @vsolve/query session
vi.mock("@vsolve/query", () => ({
  useCurrentSession: () => ({
    data: { user: { id: "cust-test-user-999" } },
  }),
}));

describe("CustomerPushPromptCard (Customer Permission UX)", () => {
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

    (window as any).OneSignal = {
      User: {
        PushSubscription: {
          id: "sub-cust-1",
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
    (window as any).OneSignalDeferred = [];
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
    delete (window as any).OneSignal;
    delete (window as any).OneSignalDeferred;
    vi.restoreAllMocks();
  });

  it("renders on booking confirmation screen when permission is default and not in cooldown", () => {
    render(<CustomerPushPromptCard bookingId="booking-123" />);

    expect(screen.getByText("Track your professional in real time")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enable notifications to get updates when your professional is assigned, on the way, and arrives.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on live updates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maybe later" })).toBeInTheDocument();

    // Does NOT invoke native permission on mount
    expect(Notification.requestPermission).not.toHaveBeenCalled();

    // Emits prompt viewed analytics
    const viewEvent = dispatchedAnalytics.find(
      (e) => e.detail.event === "customer_push_prompt_viewed",
    );
    expect(viewEvent).toBeDefined();
    expect(viewEvent?.detail.properties.role).toBe("CUSTOMER");
    expect(viewEvent?.detail.properties.trigger_event).toBe("booking_confirmation_screen");
  });

  it("does not render when permission is already granted", () => {
    (globalThis.Notification as any).permission = "granted";

    render(<CustomerPushPromptCard bookingId="booking-123" />);

    expect(screen.queryByText("Track your professional in real time")).not.toBeInTheDocument();
  });

  it("does not render on unsupported browsers", () => {
    const saved = globalThis.Notification;
    try {
      // @ts-expect-error simulating unsupported browser
      delete globalThis.Notification;

      render(<CustomerPushPromptCard bookingId="booking-123" />);

      expect(screen.queryByText("Track your professional in real time")).not.toBeInTheDocument();
    } finally {
      globalThis.Notification = saved;
    }
  });

  it("requests native permission only after clicking primary CTA and closes card on grant", async () => {
    render(<CustomerPushPromptCard bookingId="booking-123" />);

    expect(Notification.requestPermission).not.toHaveBeenCalled();

    const turnOnBtn = screen.getByRole("button", { name: "Turn on live updates" });
    await act(async () => {
      fireEvent.click(turnOnBtn);
    });

    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);

    // Prompt requested and granted analytics emitted
    expect(
      dispatchedAnalytics.some((e) => e.detail.event === "customer_push_permission_requested"),
    ).toBe(true);
    expect(
      dispatchedAnalytics.some((e) => e.detail.event === "customer_push_permission_granted"),
    ).toBe(true);

    // Card closes
    await waitFor(() => {
      expect(screen.queryByText("Track your professional in real time")).not.toBeInTheDocument();
    });
  });

  it("shows recovery guidance when permission is denied and does not re-request", async () => {
    (Notification.requestPermission as any).mockResolvedValue("denied");
    (window as any).OneSignal.Notifications.requestPermission.mockResolvedValue(false);

    render(<CustomerPushPromptCard bookingId="booking-123" />);

    const turnOnBtn = screen.getByRole("button", { name: "Turn on live updates" });
    await act(async () => {
      fireEvent.click(turnOnBtn);
    });

    expect(screen.getByText("Notifications are blocked in your browser")).toBeInTheDocument();
    expect(
      screen.getByText(
        "To get live booking updates, click the lock/settings icon in your browser address bar and set Notifications to Allow.",
      ),
    ).toBeInTheDocument();

    // Denial and recovery analytics emitted
    expect(
      dispatchedAnalytics.some((e) => e.detail.event === "customer_push_permission_denied"),
    ).toBe(true);
    expect(
      dispatchedAnalytics.some(
        (e) => e.detail.event === "customer_push_permission_denied_recovery_viewed",
      ),
    ).toBe(true);
  });

  it("dismissal sets 14-day cooldown and does not show prompt again during cooldown", () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const { unmount } = render(<CustomerPushPromptCard bookingId="booking-123" />);

    const maybeLaterBtn = screen.getByRole("button", { name: "Maybe later" });
    act(() => {
      fireEvent.click(maybeLaterBtn);
    });

    // 14 days cooldown timestamp stored
    expect(localStorage.getItem(CUSTOMER_DISMISS_KEY)).toBe(String(now));
    expect(screen.queryByText("Track your professional in real time")).not.toBeInTheDocument();

    unmount();

    // Rerender within cooldown: 10 days later
    const tenDaysLater = now + 10 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(tenDaysLater);

    render(<CustomerPushPromptCard bookingId="booking-123" />);
    expect(screen.queryByText("Track your professional in real time")).not.toBeInTheDocument();
  });
});

