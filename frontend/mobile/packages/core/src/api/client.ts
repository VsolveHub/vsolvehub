import { createApiClient, type ApiClient } from "@vsolve/api-client";

import { useAuthStore } from "../auth/auth-store";
import { apiBaseUrl } from "../config";
import { getMobileQueryClient } from "../query/query-client";

let client: ApiClient | undefined;

/** Bearer session. A lost session clears the token and the query cache. */
export function getApiClient(): ApiClient {
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
    });
  }
  return client;
}
