import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

type CrashlyticsModule = typeof import("@react-native-firebase/crashlytics");

let cached: CrashlyticsModule | null | undefined;

/**
 * `@react-native-firebase/crashlytics`, loaded on first use, or `null` where it cannot run:
 * Expo Go and the browser have no React Native Firebase native module, and importing it there
 * throws. Builds made without `GOOGLE_SERVICES_JSON` have no Firebase app, so every call below
 * also tolerates the module being present but unconfigured.
 */
function crashlyticsModule(): CrashlyticsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === "web" || isRunningInExpoGo()) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@react-native-firebase/crashlytics") as CrashlyticsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Turns crash reporting on for store and test builds and off in development, where a crash is
 * already on the developer's screen. Loading the module also installs its handlers for
 * unhandled JavaScript errors and promise rejections, which it reports in release builds.
 * Call once, at app start.
 */
export function startCrashReporting(): void {
  const mod = crashlyticsModule();
  if (mod === null) return;
  try {
    void mod.setCrashlyticsCollectionEnabled(mod.getCrashlytics(), !__DEV__);
  } catch {
    // No Firebase app in this build: nothing to report to.
  }
}

/**
 * Records an error the app caught and survived (an error boundary, a failed background task),
 * so it reaches Crashlytics without closing the app. `where` names the place it was caught.
 */
export function reportError(error: unknown, where: string): void {
  const mod = crashlyticsModule();
  if (mod === null) return;
  try {
    const crashlytics = mod.getCrashlytics();
    mod.log(crashlytics, `caught in ${where}`);
    mod.recordError(crashlytics, error instanceof Error ? error : new Error(String(error)));
  } catch {
    // Reporting must never become a second failure.
  }
}
