"use client";

import { createApiClient, type ApiClient } from "@vsolve/api-client";
import { publishToTabs } from "@vsolve/query";

import { PUBLIC_API_BASE_URL } from "./config";

/**
 * The browser's API client for the Partner app.
 *
 * One instance per tab, created lazily so importing this module during server
 * rendering does nothing.
 *
 * The unauthorized handler matters more here than on the customer side. A
 * Partner's session can end mid-job — Operations suspends the account, or the
 * session is revoked — and the Partner may be standing in someone's kitchen at
 * the time. Sibling tabs are told, but nothing redirects from here: the API
 * layer does not own routing, and throwing away an unsaved evidence draft or a
 * half-filled application is worse than showing a stale screen for a moment.
 * Screens react through `useTabSync` and can preserve the pending action.
 */

let client: ApiClient | undefined;

export function getApiClient(): ApiClient {
  if (client) return client;

  client = createApiClient({
    baseUrl: PUBLIC_API_BASE_URL,
    onUnauthorized: () => {
      publishToTabs({ type: "session.logout" });
    },
  });

  return client;
}
