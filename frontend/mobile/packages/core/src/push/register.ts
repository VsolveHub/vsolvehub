import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { request } from "@vsolve/api-client";

import { getApiClient } from "../api/client";
import { appKind, type AppKind } from "../config";
import { kvGet, kvRemove, kvSet } from "../storage/kv";

const PUSH_TOKEN_KEY = "expo-push-token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function readRegisteredPushToken(): Promise<string | null> {
  return kvGet(PUSH_TOKEN_KEY);
}

/** Permission once, then register the Expo token. A no-op in the browser and on a simulator. */
export async function registerForPush(options?: { appKind?: AppKind }): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;

  const kind = options?.appKind ?? appKind();

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("offers", {
      name: "Job offers",
      importance: Notifications.AndroidImportance.MAX,
      ...(kind === "partner" ? { sound: "booking_alert.wav" } : {}),
    });
    await Notifications.setNotificationChannelAsync("default", {
      name: "Updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || projectId.length === 0) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await request(() =>
    getApiClient().POST("/api/v1/mobile/devices/", {
      body: {
        expo_push_token: token,
        app: kind,
        platform: Platform.OS === "ios" ? "ios" : "android",
        app_version: Constants.expoConfig?.version ?? "1.0.0",
      },
    }),
  );
  await kvSet(PUSH_TOKEN_KEY, token);
  return token;
}

export async function unregisterPush(): Promise<void> {
  const token = await readRegisteredPushToken();
  if (token && Platform.OS !== "web") {
    try {
      await request(() =>
        getApiClient().POST("/api/v1/mobile/devices/unregister/", {
          body: { expo_push_token: token },
        }),
      );
    } catch {
      // Local removal still happens. The next register re-binds the token.
    }
  }
  await kvRemove(PUSH_TOKEN_KEY);
}
