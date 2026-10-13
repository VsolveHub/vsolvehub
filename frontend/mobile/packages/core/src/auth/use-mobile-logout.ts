import { request } from "@vsolve/api-client";
import { router } from "expo-router";

import { appKind } from "../config";
import { getApiClient } from "../api/client";
import { useAuthStore } from "./auth-store";
import { readRegisteredPushToken } from "../push/register";

/** Unregister this phone, end the Django session, then leave for home or login. */
export function useMobileLogout(): () => Promise<void> {
  return async () => {
    const api = getApiClient();
    const pushToken = await readRegisteredPushToken();
    if (pushToken) {
      try {
        await request(() =>
          api.POST("/api/v1/mobile/devices/unregister/", {
            body: { expo_push_token: pushToken },
          }),
        );
      } catch {
        // A failed unregister must not trap the person on a signed-in screen.
      }
    }
    try {
      await request(() => api.POST("/api/v1/auth/logout/"));
    } catch {
      // The local token is deleted either way.
    }
    await useAuthStore.getState().signOut();
    if (appKind() === "customer") {
      router.replace("/");
    } else {
      router.replace("/login");
    }
  };
}
