import * as Device from "expo-device";
import { Platform } from "react-native";

/** `UserDevice.label` and the verify body's `device_label` both stop at 100 characters. */
export const DEVICE_LABEL_MAX_LENGTH = 100;

/**
 * The OS name comes from the platform, not from `Device.osName`. On Android that is
 * `Build.VERSION.BASE_OS` whenever the maker sets it, and Motorola sets it to the whole build
 * fingerprint (`motorola/cuscoi_g/cuscoi:16/W1UUI36H…:user/release-keys`).
 */
function osName(): string {
  if (Platform.OS === "android") return "Android";
  if (Platform.OS === "ios") return Device.osName?.trim() || "iOS";
  return Device.osName?.trim() || "Web";
}

/**
 * Shown in the session list, for example `Pixel 7 · Android 14`.
 *
 * Never longer than the server accepts: an over-long label is a validation error on
 * `POST /auth/mobile/otp/verify/`, which refuses the whole sign-in over a display string.
 */
export function deviceLabel(): string {
  const model = Device.modelName?.trim() || "Phone";
  const version = Device.osVersion?.trim() ?? "";
  const label = `${model} · ${osName()}${version ? ` ${version}` : ""}`;
  return label.length > DEVICE_LABEL_MAX_LENGTH ? label.slice(0, DEVICE_LABEL_MAX_LENGTH).trimEnd() : label;
}
