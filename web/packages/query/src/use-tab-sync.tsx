"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getTabChannel, type TabMessage } from "./cross-tab";
import { queryKeys } from "./keys";

export interface TabSyncOptions {
  /**
   * Called when another tab logged out. Apps route to login here.
   * The cache is already cleared before this runs.
   */
  onRemoteLogout?: () => void;
  /**
   * Called when another tab started a checkout. The current tab must not begin a
   * competing one — it either resumes the same session or shows that checkout is
   * in progress elsewhere.
   */
  onRemoteCheckoutStarted?: (checkoutSessionId: string) => void;
}

/**
 * Keeps this tab's cache and session state consistent with sibling tabs.
 *
 * Mount once per app, inside the QueryProvider. Cache effects are applied here
 * so no screen has to remember to handle them; screen-specific reactions come
 * through the callbacks.
 */
export function useTabSync(options: TabSyncOptions = {}): void {
  const queryClient = useQueryClient();
  const { onRemoteLogout, onRemoteCheckoutStarted } = options;

  useEffect(() => {
    const channel = getTabChannel();

    const unsubscribe = channel.subscribe((message: TabMessage) => {
      switch (message.type) {
        case "session.logout":
          // Remove rather than invalidate: invalidating would refetch private
          // data with a session that no longer exists.
          queryClient.clear();
          onRemoteLogout?.();
          break;

        case "session.authenticated":
          void queryClient.invalidateQueries({ queryKey: queryKeys.session.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.addresses.all });
          break;

        case "checkout.started":
          onRemoteCheckoutStarted?.(message.checkoutSessionId);
          break;

        case "checkout.settled":
          // The outcome is authoritative only from the server, so refetch
          // rather than writing a result into the cache from a sibling tab.
          void queryClient.invalidateQueries({ queryKey: queryKeys.session.all });
          break;

        case "cache.invalidate":
          void queryClient.invalidateQueries({ queryKey: message.queryKey });
          break;
      }
    });

    return unsubscribe;
    // The channel is process-wide and the callbacks are stable per app mount.
  }, [queryClient, onRemoteLogout, onRemoteCheckoutStarted]);
}

/** Publishes a message to sibling tabs. */
export function publishToTabs(message: TabMessage): void {
  getTabChannel().publish(message);
}
