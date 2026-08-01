"use client";

import { createApiClient, type ApiClient } from "@vsolve/api-client";
import { publishToTabs } from "@vsolve/query";

import { PUBLIC_API_BASE_URL } from "./config";

/**
 * The browser's API client.
 *
 * One instance per tab. It is created lazily so importing this module during
 * server rendering does nothing, and so the session-recovery hook below is
 * installed exactly once.
 */

let client: ApiClient | undefined;

export function getApiClient(): ApiClient {
  if (client) return client;

  client = createApiClient({
    baseUrl: PUBLIC_API_BASE_URL,
    onUnauthorized: () => {
      // Django has decided this session is over. Telling sibling tabs is what
      // stops a second tab continuing to act as though the customer is signed
      // in — they would only discover otherwise at the payment step.
      //
      // Deliberately no redirect here: the API layer does not own routing, and
      // a hard redirect would throw away an in-progress booking. Screens react
      // through `useTabSync`, which can preserve the pending action.
      publishToTabs({ type: "session.logout" });
    },
  });

  return client;
}
