import appConfig from "../../../../app.config";
import { inServerTime, offsetFrom } from "./clock";
import {
  batterySteps,
  locationAccess,
  nextSetupStep,
  offDutyMessage,
  type SetupState,
} from "./duty-setup";

jest.mock("@vsolve/mobile-core", () => ({ kvGet: async () => null, kvSet: async () => undefined }));

const READY: SetupState = {
  disclosureSeen: true,
  location: "precise",
  notifications: "granted",
  notificationsAsked: true,
  batterySeen: true,
};

describe("the steps before duty", () => {
  it("go disclosure, location, precise, notifications, battery, in that order", () => {
    expect(nextSetupStep({ ...READY, disclosureSeen: false, location: "undetermined" })).toBe("disclosure");
    expect(nextSetupStep({ ...READY, location: "undetermined" })).toBe("location");
    expect(nextSetupStep({ ...READY, location: "denied" })).toBe("location_denied");
    expect(nextSetupStep({ ...READY, location: "approximate" })).toBe("precise");
    expect(nextSetupStep({ ...READY, notifications: "undetermined", notificationsAsked: false })).toBe(
      "notifications",
    );
    expect(nextSetupStep({ ...READY, batterySeen: false })).toBe("battery");
    expect(nextSetupStep(READY)).toBe("ready");
  });

  it("never block duty on notifications once asked", () => {
    expect(nextSetupStep({ ...READY, notifications: "denied" })).toBe("ready");
    expect(nextSetupStep({ ...READY, notifications: "undetermined", notificationsAsked: true })).toBe("ready");
  });

  it("treat Approximate as not enough", () => {
    expect(locationAccess({ granted: true, canAskAgain: true, android: { accuracy: "coarse" } })).toBe("approximate");
    expect(locationAccess({ granted: true, canAskAgain: true, android: { accuracy: "fine" } })).toBe("precise");
    expect(locationAccess({ granted: false, canAskAgain: true })).toBe("undetermined");
    expect(locationAccess({ granted: false, canAskAgain: false })).toBe("denied");
  });
});

describe("telling the captain why duty ended", () => {
  it("explains what the server did, and says nothing when they went off themselves", () => {
    expect(offDutyMessage("PASS_EXPIRED")).toBe("You went off duty: your pass ended.");
    expect(offDutyMessage("LOCATION_STALE")).toBe("You went off duty: we lost your location for 2 minutes.");
    expect(offDutyMessage("OPERATIONS")).toBe("VSolve support took you off duty.");
    expect(offDutyMessage("CAPTAIN_OFF")).toBeNull();
    expect(offDutyMessage(null)).toBeNull();
  });

  it("gives battery steps for the phone's maker", () => {
    expect(batterySteps("realme")[0]).toMatch(/Allow background activity/);
    expect(batterySteps("Xiaomi")[1]).toMatch(/Autostart/);
    expect(batterySteps(null)).toHaveLength(1);
  });
});

describe("the server clock", () => {
  it("measures and applies the offset", () => {
    const offset = offsetFrom("2026-11-11T10:02:00Z", Date.parse("2026-11-11T10:00:00Z"));
    expect(offset).toBe(120_000);
    expect(inServerTime(Date.parse("2026-11-11T10:00:00Z"), offset)).toBe("2026-11-11T10:02:00.000Z");
    expect(offsetFrom("not a date", 0)).toBe(0);
  });
});

describe("the app's Android permissions", () => {
  it("never ask for background location, and run location as a foreground service", () => {
    const config = appConfig({ config: {} } as never);
    expect(config.android?.blockedPermissions).toContain("ACCESS_BACKGROUND_LOCATION");
    const plugin = (config.plugins ?? []).find(
      (entry) => Array.isArray(entry) && entry[0] === "expo-location",
    ) as [string, Record<string, unknown>];
    expect(plugin[1]).toMatchObject({ isAndroidForegroundServiceEnabled: true });
    expect(plugin[1].isAndroidBackgroundLocationEnabled).toBeUndefined();
  });
});
