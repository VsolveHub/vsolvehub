import Constants from "expo-constants";
import { Platform } from "react-native";

export type AppKind = "partner" | "customer";

let configuredKind: AppKind = "customer";

/** Called once from each app's root layout. */
export function configureCore(options: { appKind: AppKind }): void {
  configuredKind = options.appKind;
}

export function appKind(): AppKind {
  return configuredKind;
}

/**
 * Resolves the backend API URL.
 * Automatically resolves 'localhost' or '127.0.0.1' to the machine's LAN IP
 * (via Expo's hostUri) when running on mobile devices or emulators, so network
 * calls never fail due to mobile loopback or Wi-Fi IP changes.
 */
export function apiBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
    (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.trim();
  const rawUrl = configured && configured.length > 0 ? configured.replace(/\/$/, "") : "http://localhost:8000";

  if (Platform.OS === "web") {
    return rawUrl;
  }

  // On native mobile (iOS / Android), 127.0.0.1 and localhost refer to the device itself.
  // Also sync stale LAN IPs to the active Expo hostUri if Wi-Fi IP changes.
  const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (devHost) {
    if (
      rawUrl.includes("localhost") ||
      rawUrl.includes("127.0.0.1") ||
      /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?(\/.*)?$/.test(rawUrl)
    ) {
      return rawUrl.replace(/^(https?:\/\/)([^:/]+)(:\d+)?/, `$1${devHost}$3`);
    }
  }

  if (rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1")) {
    if (Platform.OS === "android") {
      return rawUrl.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
    }
  }

  return rawUrl;
}

export function webBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim();
  if (configured && configured.length > 0) return configured.replace(/\/$/, "");
  return configuredKind === "partner" ? "https://partner.vsolvehub.com" : "https://vsolvehub.com";
}
