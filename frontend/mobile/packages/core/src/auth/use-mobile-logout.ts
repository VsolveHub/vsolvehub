import { request } from "@vsolve/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { appKind } from "../config";
import { getApiClient } from "../api/client";
import { useAuthStore } from "./auth-store";
import { unlinkPushUser } from "../push/onesignal";

/** Unlink this phone from push, end the Django session, then leave for home or login. */
export function useMobileLogout(redirectPath?: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    const api = getApiClient();
    // Before the session ends: Django is told this phone's subscription is gone, which needs it.
    // A failure must not trap the person on a signed-in screen; unlinkPushUser never throws.
    await unlinkPushUser();
    try {
      await request(() => api.POST("/api/v1/auth/logout/"));
    } catch {
      // The local token is deleted either way.
    }
    await useAuthStore.getState().signOut();
    queryClient.clear();
    if (redirectPath) {
      router.replace(redirectPath as never);
    } else if (appKind() === "customer") {
      router.replace("/");
    } else {
      router.replace("/login");
    }
  };
}
