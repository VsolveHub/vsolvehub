// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from "vitest";
import {
  usePushPermission,
  PARTNER_DISMISS_KEY,
  CUSTOMER_DISMISS_KEY,
  PARTNER_PROMPT_COUNT_KEY,
  CUSTOMER_PROMPT_COUNT_KEY,
} from "./usePushPermission";

type OneSignalTestWindow = {
  OneSignal: {
    User?: unknown;
    Notifications: { permissionNative: NotificationPermission; requestPermission: Mock };
  };
  OneSignalDeferred: unknown[];
};
const testWindow = window as unknown as OneSignalTestWindow;

describe("usePushPermission hook", () => {
  const originalNotification = globalThis.Notification;
  let dispatchedEvents: CustomEvent[] = [];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    dispatchedEvents = [];

    // Capture analytics events
    window.addEventListener("vsh:analytics", (e) => {
      dispatchedEvents.push(e as CustomEvent);
    });

    // Mock Notification
    globalThis.Notification = {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    } as unknown as typeof Notification;

    // Reset OneSignal globals
    testWindow.OneSignal = {
      User: {
        PushSubscription: {
          id: "sub-test-123",
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
    testWindow.OneSignalDeferred = [];
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
    Reflect.deleteProperty(window, "OneSignal");
    Reflect.deleteProperty(window, "OneSignalDeferred");
    vi.restoreAllMocks();
  });

  it("detects default permission state and confirms prompt is eligible initially", () => {
    const { result } = renderHook(() =>
      usePushPermission({ role: "PARTNER", userId: "usr-1" }),
    );

    expect(result.current.permissionState).toBe("default");
    expect(result.current.isPromptEligible).toBe(true);
    expect(result.current.promptCount).toBe(0);
    expect(result.current.lastDismissedAt).toBeNull();
  });

  it("never calls requestPermission automatically on render", () => {
    renderHook(() =>
      usePushPermission({ role: "PARTNER", userId: "usr-1" }),
    );

    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(testWindow.OneSignal.Notifications.requestPermission).not.toHaveBeenCalled();
  });

  it("dismissal sets 7-day cooldown for Partner and tracks analytics", () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const { result } = renderHook(() =>
      usePushPermission({ role: "PARTNER", userId: "usr-1" }),
    );

    expect(result.current.isPromptEligible).toBe(true);

    act(() => {
      result.current.dismissPrompt();
    });

    expect(result.current.isPromptEligible).toBe(false);
    expect(result.current.lastDismissedAt).toBe(now);
    expect(result.current.promptCount).toBe(1);
    expect(localStorage.getItem(PARTNER_DISMISS_KEY)).toBe(String(now));
    expect(localStorage.getItem(PARTNER_PROMPT_COUNT_KEY)).toBe("1");

    const dismissEvent = dispatchedEvents.find(
      (e) => e.detail.event === "partner_push_prompt_dismissed",
    );
    expect(dismissEvent).toBeDefined();
    expect(dismissEvent?.detail.properties.role).toBe("PARTNER");
    expect(dismissEvent?.detail.properties.user_id).toBe("usr-1");
  });

  it("dismissal sets 14-day cooldown for Customer", () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const { result } = renderHook(() =>
      usePushPermission({ role: "CUSTOMER", userId: "cust-9" }),
    );

    act(() => {
      result.current.dismissPrompt();
    });

    expect(result.current.isPromptEligible).toBe(false);
    expect(localStorage.getItem(CUSTOMER_DISMISS_KEY)).toBe(String(now));
    expect(localStorage.getItem(CUSTOMER_PROMPT_COUNT_KEY)).toBe("1");

    // After 10 days, Customer is STILL in cooldown
    const tenDaysLater = now + 10 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(tenDaysLater);

    const { result: laterResult } = renderHook(() =>
      usePushPermission({ role: "CUSTOMER", userId: "cust-9" }),
    );
    expect(laterResult.current.isPromptEligible).toBe(false);

    // After 15 days, Customer cooldown expires
    const fifteenDaysLater = now + 15 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(fifteenDaysLater);

    const { result: expiredResult } = renderHook(() =>
      usePushPermission({ role: "CUSTOMER", userId: "cust-9" }),
    );
    expect(expiredResult.current.isPromptEligible).toBe(true);
  });

  it("handles unsupported browser gracefully without crashing and emits analytics", () => {
    const savedNotification = globalThis.Notification;
    try {
      // @ts-expect-error simulating unsupported browser
      delete globalThis.Notification;

      const { result } = renderHook(() =>
        usePushPermission({ role: "PARTNER", userId: "usr-unsupported" }),
      );

      expect(result.current.permissionState).toBe("unsupported");
      expect(result.current.isPromptEligible).toBe(false);

      const unsupportedEvent = dispatchedEvents.find(
        (e) => e.detail.event === "partner_push_unsupported",
      );
      expect(unsupportedEvent).toBeDefined();
    } finally {
      globalThis.Notification = savedNotification;
    }
  });

  it("requests permission only after explicit action and triggers grant analytics", async () => {
    const { result } = renderHook(() =>
      usePushPermission({ role: "PARTNER", userId: "usr-2" }),
    );

    let res: string = "";
    await act(async () => {
      res = await result.current.requestPermission();
    });

    expect(res).toBe("granted");
    expect(result.current.permissionState).toBe("granted");

    // Checked that requested event fired before
    const reqEvent = dispatchedEvents.find(
      (e) => e.detail.event === "partner_push_permission_requested",
    );
    expect(reqEvent).toBeDefined();

    // Checked that granted event fired
    const grantEvent = dispatchedEvents.find(
      (e) => e.detail.event === "partner_push_permission_granted",
    );
    expect(grantEvent).toBeDefined();
  });

  it("handles permission denial and emits denial event without repeating prompt", async () => {
    vi.mocked(Notification.requestPermission).mockResolvedValue("denied");
    testWindow.OneSignal.Notifications.requestPermission.mockResolvedValue(false);

    const { result } = renderHook(() =>
      usePushPermission({ role: "CUSTOMER", userId: "cust-denied" }),
    );

    let res: string = "";
    await act(async () => {
      res = await result.current.requestPermission();
    });

    expect(res).toBe("denied");
    expect(result.current.permissionState).toBe("denied");
    expect(result.current.isPromptEligible).toBe(false);

    const denyEvent = dispatchedEvents.find(
      (e) => e.detail.event === "customer_push_permission_denied",
    );
    expect(denyEvent).toBeDefined();
  });

  it("syncSubscription sends subscription to backend and retries once on 403 CSRF error", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/v1/auth/csrf/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ csrf_token: "refreshed-csrf-token" }),
        });
      }
      callCount++;
      if (callCount === 1) {
        // First sync call fails with 403 CSRF
        return Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({ detail: "CSRF Failed" }),
        });
      }
      // Second call succeeds with refreshed token
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
    });
    globalThis.fetch = fetchMock;

    const onSyncSuccess = vi.fn();
    const { result } = renderHook(() =>
      usePushPermission({
        role: "PARTNER",
        userId: "usr-sync-test",
        apiBaseUrl: "http://localhost:8000",
        onSyncSuccess,
      }),
    );

    let syncOk = false;
    await act(async () => {
      syncOk = await result.current.syncSubscription("sync");
    });

    expect(syncOk).toBe(true);
    expect(onSyncSuccess).toHaveBeenCalled();
    expect(callCount).toBe(2);

    const syncEvent = dispatchedEvents.find(
      (e) => e.detail.event === "partner_push_subscription_synced",
    );
    expect(syncEvent).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/partner/push-subscriptions/sync/",
      expect.anything(),
    );
  });

  it("Customer syncSubscription targets /api/v1/customer/push-subscriptions/sync/", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/v1/auth/csrf/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ csrf_token: "csrf-token-123" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
    });
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() =>
      usePushPermission({
        role: "CUSTOMER",
        userId: "cust-sync-test",
        apiBaseUrl: "http://localhost:8000",
      }),
    );

    let syncOk = false;
    await act(async () => {
      syncOk = await result.current.syncSubscription("sync");
    });

    expect(syncOk).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/customer/push-subscriptions/sync/",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("successful grant clears dismissal cooldown from localStorage and resets lastDismissedAt", async () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() =>
      usePushPermission({ role: "PARTNER", userId: "usr-1" }),
    );

    // First, user dismisses
    act(() => {
      result.current.dismissPrompt();
    });

    expect(result.current.lastDismissedAt).toBe(now);
    expect(localStorage.getItem(PARTNER_DISMISS_KEY)).toBe(String(now));
    expect(result.current.isPromptEligible).toBe(false);

    // Later, manual enable or permission grant succeeds
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.permissionState).toBe("granted");
    expect(result.current.lastDismissedAt).toBeNull();
    expect(localStorage.getItem(PARTNER_DISMISS_KEY)).toBeNull();
  });
});
