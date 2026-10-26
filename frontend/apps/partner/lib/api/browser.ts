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

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The configured origin, unless that would lose the session in development.
 *
 * `127.0.0.1` and `localhost` are different sites. A page opened on
 * `http://127.0.0.1:3001` calling the default `http://localhost:8000` sends its
 * session cookie cross-site, so it is dropped — always in Incognito, which
 * blocks third-party cookies — and every authenticated read comes back `403`:
 * `/apply` rendered "We could not load your application". In development the
 * app already proxies `/api/*` to Django (see `rewrites` in next.config), so a
 * relative URL keeps the cookie first-party whichever host the page is on.
 * Production always uses the configured origin.
 */
export function browserApiBaseUrl(): string {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return PUBLIC_API_BASE_URL;
  }
  try {
    const api = new URL(PUBLIC_API_BASE_URL);
    if (LOOPBACK_HOSTS.has(api.hostname) && api.hostname !== window.location.hostname) {
      return "";
    }
  } catch {
    // An empty or relative base is already same-origin.
  }
  return PUBLIC_API_BASE_URL;
}

export function getApiClient(): ApiClient {
  if (client) return client;

  client = createApiClient({
    baseUrl: browserApiBaseUrl(),
    onUnauthorized: () => {
      publishToTabs({ type: "session.logout" });
    },
  });

  return client;
}
