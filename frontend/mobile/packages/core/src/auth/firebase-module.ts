import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

export type FirebaseAuthModule = typeof import("@react-native-firebase/auth");

/**
 * Which phone sign-in this build uses, the same switch as the web's
 * `NEXT_PUBLIC_PHONE_AUTH_PROVIDER`. Store and test builds set `firebase` in `eas.json`; local
 * development (Expo Go) keeps the server-sent code, `otp`.
 */
export function phoneAuthProvider(): "firebase" | "otp" {
  return process.env.EXPO_PUBLIC_PHONE_AUTH_PROVIDER === "firebase" ? "firebase" : "otp";
}

let cached: FirebaseAuthModule | null | undefined;

/**
 * `@react-native-firebase/auth`, loaded on first use, or `null` where it cannot run: Expo Go
 * and the browser have no React Native Firebase native module, and importing it there throws.
 * The app's own build includes it.
 */
export function getFirebaseAuthModule(): FirebaseAuthModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === "web" || isRunningInExpoGo()) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@react-native-firebase/auth") as FirebaseAuthModule;
  } catch {
    cached = null;
  }
  return cached;
}
