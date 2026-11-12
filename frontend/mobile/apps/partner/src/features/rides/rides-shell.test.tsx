import { render } from "@testing-library/react-native";
import { Platform } from "react-native";

import TabsLayout from "../../../app/(app)/(tabs)/_layout";
import { getPartnerChromeMode, routeRequiresPartnerRole } from "../session/chrome";
import { RIDES_TAP_FIRST_NAV } from "../workspace/registry";
import { blockedReasonTexts, isCaptainShell } from "./model/shell";

const mockReplace = jest.fn();
let mockPathname = "/home";
let mockCaptain: { approval: string } | undefined;

jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  Slot: () => null,
}));
jest.mock("@vsolve/mobile-core", () => ({ useMobileLogout: () => jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/features/notifications/view/notification-panel", () => ({ NotificationPanel: () => null }));
jest.mock("@/features/notifications/view/job-alerts-banner", () => ({ JobAlertsBanner: () => null }));
jest.mock("@/features/notifications/queries", () => ({
  useUnreadNotificationCount: () => ({ isSuccess: true, data: { unread: 0 } }),
}));
jest.mock("@/features/workspace/queries", () => ({ usePartnerWorkspaceGrants: () => ({ grants: [] }) }));
jest.mock("@/features/rides/queries", () => ({ useCaptainStatus: () => ({ data: mockCaptain }) }));

function setOs(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPathname = "/home";
  mockCaptain = undefined;
  setOs("android");
});

describe("which shell a partner gets", () => {
  it("is the Rides shell only for a captain, only on Android", () => {
    expect(isCaptainShell({ approval: "APPROVED" } as never, "android")).toBe(true);
    expect(isCaptainShell({ approval: "DRAFT" } as never, "android")).toBe(true);
    expect(isCaptainShell({ approval: "NOT_STARTED" } as never, "android")).toBe(false);
    expect(isCaptainShell({ approval: "APPROVED" } as never, "ios")).toBe(false);
    expect(isCaptainShell(undefined, "android")).toBe(false);
  });

  it("gives a captain Home, Rides, Wallet, Alerts and Me, and sends Home to the Rides home", async () => {
    mockCaptain = { approval: "APPROVED" };

    const view = await render(<TabsLayout />);

    expect(view.getByText("Rides")).toBeTruthy();
    expect(view.getByText("Wallet")).toBeTruthy();
    expect(view.queryByText("Work")).toBeNull();
    expect(view.queryByText("Money")).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/rides");
  });

  it("leaves a partner who is not a captain exactly as before", async () => {
    mockCaptain = { approval: "NOT_STARTED" };

    const view = await render(<TabsLayout />);

    expect(view.getByText("Work")).toBeTruthy();
    expect(view.getByText("Money")).toBeTruthy();
    expect(view.queryByText("Wallet")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("never shows the Rides shell on an iPhone", async () => {
    setOs("ios");
    mockCaptain = { approval: "APPROVED" };

    const view = await render(<TabsLayout />);

    expect(view.queryByText("Wallet")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("the Rides routes", () => {
  it("are full tab screens that need an approved partner, except the vehicle step", () => {
    for (const path of ["/rides", "/rides/history", "/rides/wallet"]) {
      expect(getPartnerChromeMode(path)).toBe("full");
      expect(routeRequiresPartnerRole(path)).toBe(true);
    }
    expect(routeRequiresPartnerRole("/rides/vehicle")).toBe(false);
    expect(RIDES_TAP_FIRST_NAV.map((item) => item.label)).toEqual([
      "Home",
      "Rides",
      "Wallet",
      "Alerts",
      "Me",
    ]);
  });

  it("explain in plain words why duty is blocked", () => {
    expect(blockedReasonTexts(["not_approved", "pass_required"])).toEqual([
      "You can go on duty once your captain application is approved.",
      "Buy a pass in Wallet to go on duty.",
    ]);
    expect(blockedReasonTexts(["something_new"])).toEqual(["You can't go on duty yet."]);
  });
});
