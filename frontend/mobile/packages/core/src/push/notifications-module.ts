import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

export type NotificationsModule = typeof import("expo-notifications");

/**
 * True in Expo Go on Android, where `expo-notifications` cannot be loaded at all.
 *
 * Since SDK 53 Expo Go no longer ships the Android push modules, and from SDK 58 merely
 * importing the package throws (`Cannot find native module 'ExpoTopicSubscriptionModule'`).
 * One static import anywhere in the route tree breaks every screen, so nothing in the apps
 * imports the package directly; everything goes through `getNotifications()`.
 */
export const notificationsUnavailable = Platform.OS === "android" && isRunningInExpoGo();

let cached: NotificationsModule | null | undefined;

/**
 * `expo-notifications`, loaded on first use, or `null` where it cannot load (Expo Go on
 * Android). The first successful load also sets how a notification shows while the app is
 * open.
 */
export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (notificationsUnavailable) {
    cached = null;
    return cached;
  }
  try {
    // A lazy require is the point: a static import would run the throwing native lookup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("expo-notifications") as NotificationsModule;
    loaded.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = loaded;
  } catch {
    cached = null;
  }
  return cached;
}
