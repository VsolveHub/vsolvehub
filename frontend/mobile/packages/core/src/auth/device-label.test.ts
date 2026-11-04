import { Platform } from "react-native";

import { DEVICE_LABEL_MAX_LENGTH, deviceLabel } from "./device-label";

// `mock` prefix: jest hoists jest.mock above the imports and only lets it see such names.
const mockDevice: { modelName: string | null; osName: string | null; osVersion: string | null } = {
  modelName: null,
  osName: null,
  osVersion: null,
};

jest.mock("expo-device", () => ({
  get modelName() {
    return mockDevice.modelName;
  },
  get osName() {
    return mockDevice.osName;
  },
  get osVersion() {
    return mockDevice.osVersion;
  },
}));

function onPlatform(os: "android" | "ios") {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
}

describe("deviceLabel", () => {
  it("uses Android, not the build fingerprint Motorola reports as osName", () => {
    onPlatform("android");
    mockDevice.modelName = "motorola edge 50 fusion";
    mockDevice.osName = "motorola/cuscoi_g/cuscoi:16/W1UUI36H.110-42/dbbf33-aa0d1:user/release-keys";
    mockDevice.osVersion = "16";

    expect(deviceLabel()).toBe("motorola edge 50 fusion · Android 16");
  });

  it("keeps the iOS name the device reports", () => {
    onPlatform("ios");
    mockDevice.modelName = "iPhone 15";
    mockDevice.osName = "iOS";
    mockDevice.osVersion = "18.1";

    expect(deviceLabel()).toBe("iPhone 15 · iOS 18.1");
  });

  it("never exceeds the length the verify endpoint accepts", () => {
    onPlatform("android");
    mockDevice.modelName = "x".repeat(150);
    mockDevice.osName = null;
    mockDevice.osVersion = "16";

    expect(deviceLabel().length).toBeLessThanOrEqual(DEVICE_LABEL_MAX_LENGTH);
  });

  it("falls back to a generic name when the model is unknown", () => {
    onPlatform("android");
    mockDevice.modelName = null;
    mockDevice.osVersion = null;

    expect(deviceLabel()).toBe("Phone · Android");
  });
});
