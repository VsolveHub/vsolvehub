import { createApiClient, type ApiClient } from "@vsolve/api-client";

import { useAuthStore } from "../auth/auth-store";
import { apiBaseUrl } from "../config";
import { getMobileQueryClient } from "../query/query-client";

export interface ExtendedHttpMethods {
  GET<T = any>(path: string, init?: Record<string, unknown>): Promise<{ data?: T; error?: unknown; response: Response }>;
  POST<T = any>(path: string, init?: Record<string, unknown>): Promise<{ data?: T; error?: unknown; response: Response }>;
  PUT<T = any>(path: string, init?: Record<string, unknown>): Promise<{ data?: T; error?: unknown; response: Response }>;
  PATCH<T = any>(path: string, init?: Record<string, unknown>): Promise<{ data?: T; error?: unknown; response: Response }>;
  DELETE<T = any>(path: string, init?: Record<string, unknown>): Promise<{ data?: T; error?: unknown; response: Response }>;
}

export type MobileApiClient = ApiClient & ExtendedHttpMethods;

let client: MobileApiClient | undefined;

/** Bearer session. A lost session clears the token and the query cache. */
export function getApiClient(): MobileApiClient {
  if (!client) {
    client = createApiClient({
      baseUrl: apiBaseUrl(),
      auth: {
        mode: "bearer",
        getToken: () => useAuthStore.getState().token,
      },
      onUnauthorized: () => {
        void useAuthStore.getState().signOut();
        getMobileQueryClient().clear();
      },
    }) as unknown as MobileApiClient;
  }
  return client;
}
