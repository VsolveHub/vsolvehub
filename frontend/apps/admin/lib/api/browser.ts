"use client";

import { createApiClient, type ApiClient } from "@vsolve/api-client";
import { publishToTabs } from "@vsolve/query";

import { PUBLIC_API_BASE_URL } from "./config";

/**
 * The browser's API client for the Operations app.
 *
 * One instance per tab, created lazily so importing this module during server
 * rendering does nothing.
 *
 * Operations sessions are the most privileged in the platform and the most
 * important to end cleanly: a revoked reviewer whose tab keeps working is a
 * reviewer still making decisions. Sibling tabs are told immediately. Routing
 * still belongs to the screens, so nothing is redirected from here.
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
