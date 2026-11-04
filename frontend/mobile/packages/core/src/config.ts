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
 * The backend API URL this build was made for (`EXPO_PUBLIC_API_BASE_URL`).
 *
 * A store or test build uses it exactly as given: `app.config.ts` stops an EAS build whose
 * address is missing or not https, so a release never quietly swaps in some other server.
 * Only development rewrites a local address, to the machine's LAN IP (via Expo's hostUri) on
 * a phone or emulator, so calls survive mobile loopback and Wi-Fi IP changes.
 */
export function apiBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
    (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.trim();

  if (!__DEV__) {
    if (!configured) throw new Error("EXPO_PUBLIC_API_BASE_URL is not set for this build.");
    return configured.replace(/\/$/, "");
  }

  const rawUrl = configured && configured.length > 0 ? configured.replace(/\/$/, "") : "http://localhost:8000";

  const isLocalOrLan =
    rawUrl.includes("localhost") ||
    rawUrl.includes("127.0.0.1") ||
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?(\/.*)?$/.test(rawUrl);

  if (Platform.OS === "web") {
    if (isLocalOrLan && typeof window !== "undefined" && window.location) {
      const hostname = window.location.hostname;
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        /^192\.168\.\d+\.\d+$|^10\.\d+\.\d+\.\d+$|^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)
      ) {
        // `localhost` goes to 127.0.0.1, never to `localhost`. Browsers resolve `localhost` to
        // the IPv6 `::1` first, while `runserver 0.0.0.0:8000` listens on IPv4 only, so the
        // call can reach another program on [::1]:8000 and fail as ERR_EMPTY_RESPONSE. The
        // different host is safe: the app authenticates with a bearer token, not cookies, and
        // local settings allow the http://localhost:8081 origin.
        const apiHost = hostname === "localhost" ? "127.0.0.1" : hostname;
        return rawUrl.replace(/^(https?:\/\/)([^:/]+)(:\d+)?/, `$1${apiHost}$3`);
      }
    }
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

/** The website this build links to (`EXPO_PUBLIC_WEB_BASE_URL`); same rules as `apiBaseUrl`. */
export function webBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim();
  if (configured && configured.length > 0) return configured.replace(/\/$/, "");
  if (!__DEV__) throw new Error("EXPO_PUBLIC_WEB_BASE_URL is not set for this build.");
  return configuredKind === "partner" ? "https://partner.vsolvehub.com" : "https://vsolvehub.com";
}
